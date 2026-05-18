# Persist Syllabus Draft Phase — Implementation Plan

> **Companion plan**: [Delta Message Transport](./delta-message-transport.md) refines the API
> transport once this plan is in place, replacing full-history requests with per-turn deltas and
> removing the need for clients to send the full message array. Sections in this plan that are
> affected by that companion plan are annotated with **→ see Delta plan**.


## 1. Context & Current Behaviour

### Syllabus chat flow today

1. The user enters a topic and picks a teaching style in the **hero** (`app/[locale]/hero.tsx`).
   `storeInitialDraft({ text, styleId })` writes the payload to `sessionStorage`, then the
   router navigates to `/journeys/new`.

2. **`SyllabusChat`** (`app/[locale]/journeys/new/syllabus-chat.tsx`) mounts, reads the
   sessionStorage payload, clears it, and immediately calls `handleSubmit` to fire the first
   message at `POST /api/syllabus/chat`.

3. The chat continues — all message state lives in **`useChat`** client memory only. The
   `updateSyllabusDraft` tool streams a live syllabus draft back; the client derives the latest
   draft from tool parts in the messages array.

4. When the user clicks **"Start journey"**, `createJourneyAction` is called:
   - Runs `bootstrapJourney` (a `generateText` call) to derive a title and learner memory from the transcript.
   - Calls `createJourney` in a DB transaction that inserts the `journeys` row and all `chapters` rows.
   - Returns the canonical journey URL; the router navigates there.

### What is missing

- **No persistence during the draft phase.** A browser refresh, tab close, or navigation away
  loses the entire conversation history.
- **The journey doesn't exist in the database** until the user explicitly clicks "Start journey".
  There is no URL to return to.
- **The syllabus-chat transcript is discarded** once the journey is created; it cannot be
  reviewed afterwards.

---

## 2. Goals

1. **Create the journey immediately** after the user's first message — not on button click.
2. **Persist every message** (user and assistant) in the database so the draft session survives
   page reloads and tab switches.
3. **Resume from the canonical journey URL.** When the user navigates back, the syllabus chat
   loads its history from the database and picks up where it left off.
4. **Expose the draft chat as "Chapter 0"** — a permanent read-only (or live) panel accessible
   after the journey is activated, so the transcript is never hidden.

---

## 3. High-Level Architecture

```
┌──────────────────────────────────────────────────────────────┐
│  Hero                                                         │
│  sessionStorage ← { text, styleId }                          │
│  router.push('/journeys/new')                                 │
└───────────────────────────────┬──────────────────────────────┘
                                │ navigate
┌───────────────────────────────▼──────────────────────────────┐
│  /journeys/new  (SyllabusChat)                                │
│                                                               │
│  mount: read sessionStorage                                   │
│         ↓                                                     │
│  createDraftJourneyAction({ text, styleId })                  │
│    → INSERT journeys(status='drafting', title≈text, …)       │
│    → returns { id, slug }                                     │
│         ↓                                                     │
│  router.replace('/journeys/<slug>-<id>')                      │
│         ↓ (same React tree, URL bar updates)                  │
│  auto-submit first message to /api/syllabus/chat              │
│       body: { journeyId, styleId, locale, message: <new msg> }│
│       (transport sends only the delta — see Delta plan)       │
│         ↓                                                     │
│  API route:                                                    │
│    – (edit/regenerate) deletes superseded DB messages         │
│    – saves incoming user message to messages table            │
│    – reads full history from DB → streams response            │
│    – onFinish: saves assistant message(s) to messages table   │
│    – onFinish: saves latest draft to journeys.syllabus        │
└───────────────────────────────┬──────────────────────────────┘
                                │ user clicks "Start journey"
┌───────────────────────────────▼──────────────────────────────┐
│  activateJourneyAction({ journeyId, syllabus, styleId })       │
│    – reads messages from DB for bootstrapJourney              │
│    – bootstrapJourney → final title + memory                  │
│    – UPDATE journeys SET status='active', title, memory, …   │
│    – INSERT chapters rows                                     │
│    – returns canonical journey path (possibly new title slug) │
│  router.push(activeChapterPath)                               │
└───────────────────────────────┬──────────────────────────────┘
                                │
┌───────────────────────────────▼──────────────────────────────┐
│  /journeys/<slug>/page.tsx                                    │
│    status='active'  → redirect to active chapter (current)   │
│    status='drafting' → render JourneySyllabusChat component   │
│      (loads messages from DB, resumes syllabus chat)          │
└───────────────────────────────┬──────────────────────────────┘
                                │ "Chapter 0" link in sidebar
┌───────────────────────────────▼──────────────────────────────┐
│  /journeys/<slug>/syllabus                                    │
│    – standalone page showing full draft transcript            │
│    – read-only after activation                               │
│    – listed first in SyllabusPanel as "Syllabus chat"         │
└──────────────────────────────────────────────────────────────┘
```

---

## 4. Database Schema Changes

### 4.1 New Postgres enum: `journey_status`

```sql
CREATE TYPE "journey_status" AS ENUM ('drafting', 'active');
```

### 4.2 `journeys` table — add `status` column

```sql
ALTER TABLE "journeys"
  ADD COLUMN "status" journey_status NOT NULL DEFAULT 'active';
```

The default is `'active'` so all existing rows remain valid without migration data backfill.
New draft rows are inserted with `status = 'drafting'`; the default never fires for new code.

In `lib/server/db/schema.ts`:

```ts
export const journeyStatusEnum = pgEnum('journey_status', ['drafting', 'active']);

export const journeys = pgTable('journeys', {
  // … existing columns …
  status: journeyStatusEnum('status').notNull().default('active'),
});
```

### 4.3 New `messages` table

```sql
CREATE TABLE "messages" (
  "id"         text PRIMARY KEY,
  "journey_id" text    NOT NULL REFERENCES journeys(id) ON DELETE CASCADE,
  "chapter_id" text             REFERENCES chapters(id) ON DELETE CASCADE,
  "role"       text    NOT NULL,   -- 'user' | 'assistant'
  "parts"      jsonb   NOT NULL,
  "metadata"   jsonb,
  "created_at" timestamp NOT NULL DEFAULT now()
);

-- Efficient lookup for a given conversation scope
CREATE INDEX messages_journey_chapter_idx ON messages (journey_id, chapter_id);
```

`chapter_id IS NULL` means the message belongs to the **syllabus draft chat** (the global
chapter-0 scope). A non-null `chapter_id` scopes the message to a specific chapter session.

In `lib/server/db/schema.ts`:

```ts
export const messages = pgTable(
  'messages',
  {
    id: text('id').primaryKey(),
    journeyId: text('journey_id')
      .notNull()
      .references(() => journeys.id, { onDelete: 'cascade' }),
    chapterId: text('chapter_id').references(() => chapters.id, {
      onDelete: 'cascade',
    }),
    role: text('role').notNull(),
    parts: jsonb('parts').notNull(),
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [
    index('messages_journey_chapter_idx').on(t.journeyId, t.chapterId),
  ],
);
```

### 4.4 Drizzle migration

Run `pnpm db:generate` after updating `schema.ts` to produce the migration file. The deploy
script (`vercel.json` → `db:migrate:deploy`) will apply it automatically on push.

---

## 5. Entity Layer (`lib/server/`)

### 5.1 `lib/server/journeys/create.ts` — add `createDraftJourney`

Add a new exported function alongside the existing `createJourney`:

```ts
/** Parameters for creating a draft journey at chat start. */
export type CreateDraftJourneyParams = {
  userId: string;
  /** Draft title derived from the user's first message text. */
  title: string;
  styleId: string;
};

/** Minimal return type from draft creation. */
export type CreatedDraftJourney = { id: string; title: string };

/**
 * Creates a draft journey row (status = 'drafting') with no chapters.
 * Called immediately when the user sends their first syllabus message.
 */
export async function createDraftJourney({
  userId,
  title,
  styleId,
}: CreateDraftJourneyParams): Promise<CreatedDraftJourney> {
  const [journey] = await db
    .insert(journeys)
    .values({
      userId,
      title,
      styleId,
      status: 'drafting',
      syllabus: { chapters: [] },
      memory: '',
    })
    .returning({ id: journeys.id, title: journeys.title });
  return journey;
}
```

`createJourney` (the existing function used by the chapter-creation path) is **unchanged**
and remains responsible for the active-journey transactional insert.

### 5.2 `lib/server/journeys/activate.ts` — new module

Handles the transition from `drafting` → `active` when the user clicks "Start journey".
This replaces what `createJourney` did via a server action — instead of inserting a new
journey, it mutates an existing draft one.

```ts
/** Parameters for activating a draft journey. */
export type ActivateJourneyParams = {
  userId: string;
  journeyId: string;
  /** Final title from bootstrapJourney. */
  title: string;
  /** Learner context memory from bootstrapJourney. */
  memory: string;
  /** Final syllabus to lock in and create chapters from. */
  syllabus: Syllabus;
};

/** Minimal result returned after activation. */
export type ActivatedJourney = { id: string; title: string };

/**
 * Transitions a draft journey to active status in a single transaction:
 * – updates the journey row (status, title, memory, syllabus)
 * – inserts chapter rows (first chapter active, rest locked)
 *
 * Throws if the journey does not belong to the user or is not in drafting status.
 */
export async function activateJourney(
  params: ActivateJourneyParams,
): Promise<ActivatedJourney>;
```

The transaction mirrors the logic inside `createJourney` (chapter inserts) but operates on
an existing row via `UPDATE` rather than `INSERT`.

### 5.3 `lib/server/journeys/get.ts` — expose `status`

- Add `status: 'drafting' | 'active'` to the `Journey` type and to the `SELECT` in `getJourney`.
- No behavioral change; existing callers ignore the new field until they need it.

### 5.4 `lib/server/messages/` — new module  *(→ see Delta plan §5 for `deleteMessagesFrom`)*

**`lib/server/messages/save.ts`**

```ts
import type { UIMessage } from 'ai';

/** Parameters for bulk-upserting messages into a conversation scope. */
export type SaveMessagesParams = {
  journeyId: string;
  /** null = syllabus chat scope; a chapter ID = chapter chat scope. */
  chapterId: string | null;
  messages: UIMessage[];
};

/**
 * Upserts an array of UIMessages into the messages table.
 * Uses INSERT … ON CONFLICT (id) DO UPDATE so the call is idempotent —
 * re-sending the same message ID is safe.
 */
export async function saveMessages(params: SaveMessagesParams): Promise<void>;
```

The implementation maps each `UIMessage` to `{ id, journeyId, chapterId, role, parts, metadata }`.
Parts and metadata are stored as JSONB.

**`lib/server/messages/get.ts`**

```ts
/** Parameters for fetching messages for a conversation scope. */
export type GetMessagesParams = {
  journeyId: string;
  /** null = syllabus chat scope. */
  chapterId: string | null;
};

/**
 * Returns UIMessages for the given conversation scope, ordered by createdAt.
 */
export async function getMessages(
  params: GetMessagesParams,
): Promise<UIMessage[]>;
```

The implementation fetches rows ordered by `created_at` and reconstructs `UIMessage` objects.

**`lib/server/messages/delete.ts`** — see the Delta Message Transport plan (§5) for the full
spec. The function `deleteMessagesFrom` truncates a conversation from a given message ID
onwards. It must be added to this module before the delta transport is enabled.

**`lib/server/messages/index.ts`** — barrel re-exporting all functions and their param types.

### 5.5 `lib/server/journeys/update-draft.ts` — new module

```ts
/** Parameters for saving the latest syllabus draft to an in-progress journey. */
export type UpdateDraftParams = {
  journeyId: string;
  syllabus: Syllabus;
};

/**
 * Replaces the `syllabus` field on a drafting journey.
 * Called after each streaming turn that produced an updateSyllabusDraft tool call.
 */
export async function updateDraftSyllabus(
  params: UpdateDraftParams,
): Promise<void>;
```

---

## 6. Feature Module (`lib/syllabus-chat/`)

### 6.1 Add `index.ts` barrel

The module currently has no barrel, which the architecture rules require for multi-file modules.
Create `lib/syllabus-chat/index.ts` that re-exports only the public API:

```ts
export { bootstrapJourney } from './bootstrap';
export type { BootstrapJourneyInput, BootstrapResult } from './bootstrap';
export { composeSyllabusSystemPrompt } from './prompts';
export type { ComposeSyllabusSystemPromptParams } from './prompts';
export { createUpdateSyllabusDraftTool } from './tool';
```

### 6.2 Update `tool.ts` — `createUpdateSyllabusDraftTool`

The current `updateSyllabusDraft` is a static singleton tool with a no-op execute. It needs to
be a factory so the execute closure can persist the draft to the database:

```ts
/** Parameters for {@link createUpdateSyllabusDraftTool}. */
type CreateUpdateSyllabusDraftToolParams = {
  journeyId: string;
};

/**
 * Creates the updateSyllabusDraft tool bound to a specific draft journey.
 * The execute callback persists the new draft to the database so the latest
 * version survives page reloads.
 */
export function createUpdateSyllabusDraftTool({
  journeyId,
}: CreateUpdateSyllabusDraftToolParams) {
  return tool({
    description: `Replace the entire syllabus draft with the new version.`,
    inputSchema: z.object({ draft: syllabusSchema }),
    execute: async ({ draft }) => {
      await updateDraftSyllabus({ journeyId, syllabus: draft });
      return { ok: true };
    },
  });
}
```

All consumers that imported the old `updateSyllabusDraft` singleton must be updated to call
the factory instead.

---

## 7. API Routes  *(→ see Delta plan §7 for the full delta contract)*

### 7.1 `POST /api/syllabus/chat` — update

**Request body** (initial persistence shape — superseded by the Delta plan once that is
deployed):

```ts
export type RequestBody = {
  /** The single new or edited user message. Absent for regenerations. */
  message?: UIMessage;
  /** ID of the assistant message to replace. Present for regenerations only. */
  regenerateFromMessageId?: string;
  journeyId: string;
  styleId: string;
  locale: Locale;
};
```

Exactly one of `message` or `regenerateFromMessageId` must be present; the route returns 400
otherwise.

**Server-side changes**:

1. Validate that the journey exists and belongs to the caller (`getJourney`); return 403 if not.
2. Verify `journey.status === 'drafting'`; return 409 if already active.
3. Instantiate `createUpdateSyllabusDraftTool({ journeyId })` instead of the static singleton.
4. Apply the delta algorithm (from the Delta plan §4):
   - For regenerations: call `deleteMessagesFrom` then load history from DB.
   - For new/edited messages: call `deleteMessagesFrom` (no-op for new), save the incoming
     message via `saveMessages`, then load history from DB.
5. Convert DB history to model messages and call `streamText`.
6. Pass `onFinish` to `streamText` to save the assistant response:
   ```ts
   onFinish: async ({ response }) => {
     await saveMessages({ journeyId, chapterId: null, messages: response.messages });
   }
   ```
7. The tool's `execute` already saves the draft syllabus — no additional `onFinish` logic needed
   for that.

### 7.2 `POST /api/journeys/[journeyId]/chapters/[chapterId]/chat` — note only

Message persistence for chapter chat is out of scope for this plan. No changes to the chapter
chat route are required here. The Delta plan §8 describes what will be needed when chapter
message persistence is added.

---

## 8. Server Actions

### 8.1 `createDraftJourneyAction` — new server action

Location: `app/[locale]/journeys/new/create-draft-journey.ts`

```ts
'use server';

/** Input for {@link createDraftJourneyAction}. */
export type CreateDraftJourneyInput = {
  /** The user's initial message text; used as a draft title. */
  text: string;
  styleId: string;
};

/** Result returned after the draft journey is created. */
export type CreateDraftJourneyResult = {
  /** Newly created journey ID. */
  id: string;
  /** Canonical URL path for the draft journey, e.g. `/journeys/teach-me-rust-abc1234567`. */
  path: string;
};

/**
 * Creates a draft journey immediately when the user sends their first message.
 * The title is a rough slug derived from the input text; bootstrapJourney will
 * replace it with a proper title when the journey is activated.
 */
export async function createDraftJourneyAction(
  input: CreateDraftJourneyInput,
): Promise<CreateDraftJourneyResult>;
```

Implementation:
- Auth check via `auth()`, throw if not authenticated.
- `ensureUser(userId)`.
- Call `createDraftJourney({ userId, title: input.text.slice(0, 120), styleId })`.
- Return `{ id, path: journeyPath(id, title) }`.

### 8.2 `createJourneyAction` → `activateJourneyAction` — replace server action

Location: `app/[locale]/journeys/new/activate-journey.ts`

The existing `createJourneyAction` in `create-journey.ts` is **replaced** by
`activateJourneyAction`. The key differences:

| Aspect | Old (`createJourneyAction`) | New (`activateJourneyAction`) |
|--------|----------------------------|-------------------------------|
| DB operation | Inserts new journey + chapters | Updates existing draft journey + inserts chapters |
| Input | `messages`, `syllabus`, `styleId` | `journeyId`, `syllabus`, `styleId` — messages read from DB |
| Output | `id`, `path` | `path` (path may change if title slug changes) |

```ts
'use server';

export type ActivateJourneyInput = {
  journeyId: string;
  /** Final confirmed syllabus draft. */
  syllabus: Syllabus;
  /** Final teaching style at the moment of activation. */
  styleId: string;
};

export type ActivateJourneyResult = {
  /** Canonical path after activation (title may have changed). */
  path: string;
};

/**
 * Finalises a draft journey: reads the persisted chat transcript from the
 * database, runs bootstrapJourney to derive the proper title and learner
 * memory, then activates the journey and creates its chapters.
 */
export async function activateJourneyAction(
  input: ActivateJourneyInput,
): Promise<ActivateJourneyResult>;
```

Implementation:
- Auth + `ensureUser`.
- Parse and validate `syllabus`.
- `getJourney({ userId, id: input.journeyId })` — throw if not found or not drafting.
- `getMessages({ journeyId: input.journeyId, chapterId: null })` → `messages`.
- `bootstrapJourney({ draft: syllabus, messages, locale })` → `{ title, memory }`.
- `activateJourney({ userId, journeyId, title, memory, syllabus })`.
- Return `{ path: journeyPath(journeyId, title) }`.

> **Migration note for callers**: `SyllabusChat` currently calls `createJourneyAction` with the
> full `messages` array. It must be updated to call `activateJourneyAction` with only
> `journeyId`, `syllabus`, and `styleId`.

---

## 9. Pages & Components

### 9.1 `app/[locale]/journeys/new/syllabus-chat.tsx` — refactor

The component is restructured into two phases:

**Phase A — Draft creation (first mount, sessionStorage present)**

```
mount
  │
  ├─ read sessionStorage (text, styleId) — do NOT clear yet
  │
  ├─ call createDraftJourneyAction({ text, styleId })
  │   └─ returns { id, path }
  │
  ├─ router.replace(path)          ← URL bar updates; React tree stays mounted
  │
  ├─ clear sessionStorage
  │
  └─ handleSubmit({ text, body: { journeyId: id, styleId } })
```

After `router.replace`, the URL changes to `/journeys/<slug>-<id>` but the component
**does not unmount** because the route segment (`/journeys/new`) has not changed — the browser
URL changes but the App Router treats it as a soft navigation to a different URL pattern.

> **Important**: `router.replace` navigates to a different route (`/journeys/[journeySlug]`),
> which WILL cause a remount. To avoid losing in-flight state, do the following:
>
> 1. Do NOT use `router.replace`. Instead, use `window.history.replaceState(null, '', path)`.
>    This updates the URL bar without a React navigation.
> 2. The `/journeys/new` page stays rendered. If the user manually refreshes, the URL is now
>    the journey URL, so the journey page loads instead (showing the resume flow).

**Phase B — Chat with journeyId**

All `handleSubmit`, `handleRegenerate`, and `handleEditMessage` calls include
`body: { journeyId, styleId }` so the API route has the context to identify the conversation
scope and save messages. The `prepareSendMessagesRequest` callback in `useJourneyChat` (§11)
intercepts each outgoing request and builds the correct delta body from these fields.

The "Start journey" button calls `activateJourneyAction` instead of `createJourneyAction`.
The `messages` array is **no longer passed** — the server reads them from the database:

```tsx
const handleStartJourney = () => {
  if (!startable) return;
  startTransition(async () => {
    const result = await activateJourneyAction({
      journeyId,
      syllabus: draft,
      styleId,
    });
    router.push(result.path);
  });
};
```

### 9.2 `app/[locale]/journeys/[journeySlug]/page.tsx` — handle drafting status

The page currently always redirects to a chapter. It must branch on `journey.status`:

```ts
// After fetching journey:
if (journey.status === 'drafting') {
  // Render the syllabus chat with persisted history
  const initialMessages = await getMessages({ journeyId: journey.id, chapterId: null });
  return (
    <JourneySyllabusChat
      journey={journey}
      initialMessages={initialMessages}
      presets={getStyles()}
    />
  );
}

// Existing active-journey redirect logic:
const target = journey.chapters.find(…) ?? …;
redirect(…);
```

### 9.3 New component `JourneySyllabusChat` — resume view

Location: `app/[locale]/journeys/[journeySlug]/journey-syllabus-chat.tsx`

This is a close sibling to `SyllabusChat` (the `/journeys/new` version) but:
- It receives `initialMessages: UIMessage[]` from the server (no sessionStorage read).
- It never auto-submits on mount (the initial message is already in `initialMessages`).
- It has the `journeyId` from the journey prop (no draft-creation step needed).
- It still shows the `SyllabusDraftPanel` and `StylePicker` in the sidebar.
- The "Start journey" button calls `activateJourneyAction` with the correct `journeyId`.

`useJourneyChat` supports `initialMessages` by adding it to the `UseJourneyChatParams` type
and forwarding it to `useChat`:

```ts
export function useJourneyChat<TMessage extends UIMessage = UIMessage>({
  api,
  initialMessages,
}: UseJourneyChatParams) {
  const { messages, … } = useChat<TMessage>({
    transport: new DefaultChatTransport({ api }),
    initialMessages,
  });
  // …
}
```

### 9.4 `app/[locale]/journeys/[journeySlug]/syllabus/page.tsx` — "Chapter 0"

A new server-rendered page at the `/syllabus` sub-path that shows the full syllabus draft
transcript after the journey has been activated.

```
URL: /journeys/<journey-slug>/syllabus
```

**Behaviour**:
- Fetch the journey (must belong to the user, must be `active`; draft journeys redirect to the
  journey root which shows the draft chat).
- Fetch messages with `getMessages({ journeyId, chapterId: null })`.
- Render a read-only message list using `JourneyChatView` with `status='ready'` and no prompt
  input.

A minimal read-only wrapper is sufficient — the messages have already been captured; no further
AI calls are needed from this page.

### 9.5 `SyllabusPanel` — add "Syllabus chat" link

`app/[locale]/journeys/[journeySlug]/[chapterSlug]/syllabus-panel.tsx` currently lists chapters.
Add an entry at the top of the list (above Chapter 1) that links to `/journeys/<slug>/syllabus`.

The entry should be visible only when the journey has persisted draft messages (i.e., when the
`messages` count for `chapterId = null` is non-zero). To avoid an extra DB query in the chapter
page, pass a boolean `hasSyllabusChat` down from the server page component — `getJourney` can
include a simple count query, or a new `hasSyllabusChatMessages({ journeyId })` helper can be
added to `lib/server/messages/get.ts`.

The `Journey` type in `lib/server/journeys/get.ts` should gain a `hasSyllabusChat: boolean`
field populated by this check.

---

## 10. URL Design & Navigation

| Scenario | URL |
|----------|-----|
| New syllabus chat (entry) | `/journeys/new` |
| Draft in progress (after first message) | `/journeys/<title-slug>-<id>` (URL bar only; page stays mounted at `/journeys/new`) |
| Resume draft journey | `/journeys/<title-slug>-<id>` → journey page detects `drafting`, renders resume component |
| Active journey | `/journeys/<title-slug>-<id>` → redirects to active chapter |
| "Chapter 0" (draft transcript) | `/journeys/<title-slug>-<id>/syllabus` |
| Chapter N | `/journeys/<title-slug>-<id>/<n>-<chapter-slug>-<chapter-id>` |

**Title slug derivation for draft journeys**: the initial title passed to `createDraftJourney`
is the first 120 characters of the user's input text. `slugify()` from `lib/url.ts` converts
it to a safe URL segment. After `activateJourney` updates the title (from `bootstrapJourney`),
the canonical URL may change (new title slug). The journey index page (`/journeys/[journeySlug]`)
issues a `permanentRedirect` for any stale slugs — this guard already exists for active journeys
and applies here without extra work.

---

## 11. `lib/journey-chat/` — `useJourneyChat` update  *(→ see Delta plan §6)*

`useJourneyChat` wraps `useChat` from `@ai-sdk/react`. Two additions are needed:

**`initialMessages`** — pre-populates the chat with persisted history on resume:

```ts
export type UseJourneyChatParams = {
  api: string;
  /** Pre-populated messages for resumed sessions. */
  initialMessages?: UIMessage[];
};
```

Forward `initialMessages` to `useChat`.

**`prepareSendMessagesRequest`** — sends only the delta on each turn instead of the full
history (see the Delta plan §6 for the full callback implementation):

```ts
transport: new DefaultChatTransport({
  api,
  prepareSendMessagesRequest: ({ messages, trigger, messageId, body }) => {
    if (trigger === 'regenerate-message') {
      return { body: { ...body, regenerateFromMessageId: messageId } };
    }
    return { body: { ...body, message: messages[messages.length - 1] } };
  },
}),
```

Update the barrel export in `lib/journey-chat/index.ts`.

---

## 12. i18n

Add the following keys to both `messages/en.json` and `messages/fr.json`.

**`Welcome` namespace** (syllabus chat screen):

| Key | EN value | FR value |
|-----|----------|----------|
| `creatingJourney` | `"Setting up your journey…"` | `"Préparation de votre parcours…"` |

**`Chapter` namespace** (syllabus panel & sidebar):

| Key | EN value | FR value |
|-----|----------|----------|
| `syllabusChat` | `"Syllabus chat"` | `"Chat du programme"` |
| `syllabusChapterLabel` | `"How we built this"` | `"Comment nous avons construit cela"` |

**`SyllabusPage` namespace** (new Chapter-0 page):

| Key | EN value | FR value |
|-----|----------|----------|
| `header` | `"Syllabus chat"` | `"Chat du programme"` |
| `description` | `"The conversation where we built your syllabus."` | `"La conversation où nous avons construit votre programme."` |

---

## 13. Testing

### 13.1 Entity layer — unit tests

Each new function in `lib/server/` gets a unit test file alongside it. All DB calls are mocked
via `vi.mock('@/lib/server/db')`.

| File | Tests |
|------|-------|
| `lib/server/journeys/create.test.ts` | Add test for `createDraftJourney` — inserts with `status='drafting'`, `syllabus: { chapters: [] }`. |
| `lib/server/journeys/activate.test.ts` | `activateJourney` updates existing row, inserts chapters, first chapter `active`, rest `locked`. Throws if journey not in `drafting` status. |
| `lib/server/journeys/get.test.ts` | Update existing tests to assert `status` field is present. |
| `lib/server/messages/save.test.ts` | `saveMessages` upserts; calling twice with same IDs does not duplicate rows. |
| `lib/server/messages/get.test.ts` | `getMessages` returns messages ordered by `createdAt`; `chapterId: null` returns only syllabus-scope messages. |

### 13.2 Syllabus-chat feature — unit tests

| File | Tests |
|------|-------|
| `lib/syllabus-chat/tool.test.ts` | Update to test factory `createUpdateSyllabusDraftTool({ journeyId })`; assert `execute` calls `updateDraftSyllabus` with correct args. |

### 13.3 API route — unit / integration tests

| File | Tests |
|------|-------|
| `app/api/syllabus/chat/route.test.ts` | `journeyId` required (400 if absent); 403 when journey not owned by user; 409 when journey already active; 400 when both `message` and `regenerateFromMessageId` absent; new message: `saveMessages` called with user message, then response messages saved in `onFinish`; edit: `deleteMessagesFrom` called before `saveMessages`; regenerate: `deleteMessagesFrom` called, no `saveMessages` for user turn. |

### 13.4 Server action — unit tests

| File | Tests |
|------|-------|
| `app/[locale]/journeys/new/create-draft-journey.test.ts` | Auth check; calls `createDraftJourney`; returns correct path. |
| `app/[locale]/journeys/new/activate-journey.test.ts` | Auth check; validates syllabus; calls `bootstrapJourney` and `activateJourney`; returns updated path. |

---

## 14. Implementation Order

Implement the feature in this sequence. Each step is independently testable and deployable
(with feature-flag caveats noted where applicable).

### Step 1 — Database schema & migration

- Update `lib/server/db/schema.ts`:
  - Add `journeyStatusEnum` (`'drafting' | 'active'`).
  - Add `status` column to `journeys` (default `'active'`).
  - Add `messages` table.
- Run `pnpm db:generate` to create the migration file.
- Deploy to verify migration runs cleanly. No functional change; all existing journeys get
  `status = 'active'` by default.

### Step 2 — Entity layer

1. `lib/server/journeys/get.ts` — add `status` to `Journey` type and SELECT.
2. `lib/server/journeys/create.ts` — add `createDraftJourney`.
3. `lib/server/journeys/activate.ts` — new module with `activateJourney`.
4. `lib/server/journeys/update-draft.ts` — new module with `updateDraftSyllabus`.
5. `lib/server/messages/save.ts`, `get.ts`, and `delete.ts` — new module with barrel.

Write unit tests alongside each new function. The `deleteMessagesFrom` function (in `delete.ts`)
is required by the delta API contract; build it here alongside the rest of the messages module.

### Step 3 — Syllabus-chat feature module

- Refactor `lib/syllabus-chat/tool.ts` to export `createUpdateSyllabusDraftTool` factory.
- Add `lib/syllabus-chat/index.ts` barrel.
- Update `app/api/syllabus/chat/route.ts` to use the new factory.
- Update `tool.test.ts`.

### Step 4 — Server actions

- Add `app/[locale]/journeys/new/create-draft-journey.ts` (`createDraftJourneyAction`).
- Rename / replace `app/[locale]/journeys/new/create-journey.ts` with `activate-journey.ts`
  (`activateJourneyAction`); remove `messages` from input, read from DB instead.

### Step 5 — API route update

- Update `app/api/syllabus/chat/route.ts`:
  - Change `RequestBody` from `messages: UIMessage[]` to `message?: UIMessage` +
    `regenerateFromMessageId?: string`.
  - Require `journeyId`; validate ownership and status.
  - Implement the delta server algorithm: `deleteMessagesFrom`, `saveMessages`, `getMessages`,
    `convertToModelMessages`, stream, save response in `onFinish`.
  - Use `createUpdateSyllabusDraftTool` factory.

### Step 6 — `useJourneyChat` update

- Add `initialMessages` to `UseJourneyChatParams`.
- Add `prepareSendMessagesRequest` to `DefaultChatTransport` (see Delta plan §6).
- Update barrel export in `lib/journey-chat/index.ts`.

### Step 7 — `SyllabusChat` component refactor

- Update `app/[locale]/journeys/new/syllabus-chat.tsx`:
  - Add draft-creation phase (calls `createDraftJourneyAction`, updates URL bar via
    `window.history.replaceState`).
  - Thread `journeyId` through all chat submissions.
  - Wire "Start journey" to `activateJourneyAction`.
- Update i18n with new `Welcome.creatingJourney` key.

### Step 8 — Journey index page: draft branch

- Update `app/[locale]/journeys/[journeySlug]/page.tsx`:
  - Fetch messages for `chapterId: null` when `journey.status === 'drafting'`.
  - Render new `JourneySyllabusChat` component.
- Create `app/[locale]/journeys/[journeySlug]/journey-syllabus-chat.tsx`.

### Step 9 — "Chapter 0" page & sidebar link

- Create `app/[locale]/journeys/[journeySlug]/syllabus/page.tsx`.
- Update `lib/server/journeys/get.ts` to include `hasSyllabusChat` (count query).
- Update `SyllabusPanel` to show "Syllabus chat" link when `journey.hasSyllabusChat`.
- Add i18n keys for the new namespace.

### Step 10 — End-to-end smoke test

Manually verify the following user stories in a staging environment:

1. **New journey**: Hero → type topic → chat streams → syllabus builds → "Start journey" →
   redirected to Chapter 1. Journey URL was visible in URL bar from first message.
2. **Refresh during draft**: Mid-conversation, hard-refresh the page. Chat history reloads from
   DB; user can continue building the syllabus.
3. **Resume from navigation**: Navigate away from the draft URL, then use the browser back
   button or re-enter the URL. Same result as step 2.
4. **Chapter 0 access**: After activating the journey, navigate to `/syllabus` sub-path.
   Full draft transcript is visible. Syllabus panel in chapter views shows the "Syllabus chat"
   link.
5. **Multiple drafts**: Start two separate journeys from the hero. Both draft URLs are
   independently accessible.

---

## 15. Out of Scope

- **Chapter chat message persistence**: The `messages` table schema is designed to support this
  — `chapterId IS NOT NULL` rows are ready — but the chapter chat route is not changed in this
  plan. The Delta plan §8 describes the additional work needed when chapter persistence is added,
  including the synthetic-message edge case.
- **Draft journey list / dashboard**: Showing the user a list of their in-progress drafts is
  useful but is a separate UX feature. The `status` column makes it trivially queryable.
- **Stale draft cleanup**: Drafts that are never activated will accumulate. A background job or
  TTL-based deletion policy is a future operational concern.
