# Delta Message Transport — Revised Implementation Plan

> Supersedes `.claude/plans/delta-message-transport.md`. The original plan was
> written before message persistence shipped. The codebase has since moved: both
> chat routes already persist, the entity layer settled on `getMessages` +
> `syncMessages` (not the planned `saveMessages` + `deleteMessagesFrom`), routes
> changed shape, `styleId` left the wire, and the synthetic "applied syllabus
> change" message is now stripped rather than persisted. This revision
> re-targets the plan at the code as it stands today.

## Context

Both chat endpoints already persist their conversations to the `messages` table
on every turn via `syncMessages` (delete-stale + upsert inside a transaction).
Reloads restore full history from the DB, and because `syncMessages` reconciles
the DB to whatever the client sends, edits/regenerations are already correct.

But the client still sends the **entire** `messages: UIMessage[]` array on every
turn, and the server builds the model context from that client-supplied array —
not from the DB. Two problems remain:

1. **Bandwidth** — the request grows unbounded with conversation length.
2. **Trust** — the server cannot tell whether the client-supplied history was
   tampered with; it streams a response based on whatever arrives.

The fix is **delta transport**: the client sends only the new/edited message (or
a regenerate signal), and the server assembles the canonical context by reading
the DB. The database becomes the single source of truth; the wire carries only
the turn's delta.

**Confirmed decisions:**

- **Delta-native primitives.** Drop `syncMessages` (built to accept a whole
  conversation per payload — the shape we are eliminating) in favour of
  `saveMessages` (append rows) + `deleteMessagesFrom` (truncate a tail) + the
  existing `getMessages` (read scope).
- **Both routes convert together.** Persistence is already live for each.
- **Synthetic messages are persisted, not ephemeral (Option B).** See §3 — the
  alternative ("assistant speaks with no user message") is impossible on the
  Anthropic API, so synthetic cue messages live in the DB and are hidden or
  specially rendered in the UI via two orthogonal `metadata` flags (`hidden` /
  `action`).

---

## Gap analysis — original plan vs. current code

| Original plan assumed                                          | Reality today                                                                          | Effect on plan                                                          |
| -------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `saveMessages` + `getMessages` exist; add `deleteMessagesFrom` | `getMessages` + `syncMessages`; no `saveMessages`/`deleteMessagesFrom`                 | Drop `syncMessages`; add `saveMessages` **and** `deleteMessagesFrom`    |
| Persistence pending; chapter delta deferred                    | Both routes persist already                                                            | No sequencing gate; convert both now                                    |
| Route `POST /api/syllabus/chat`, `journeyId` in body           | `app/api/journeys/[journeyId]/syllabus/chat/route.ts`; `journeyId` redundantly in body | Read `journeyId` from path; drop from body                              |
| `styleId` in syllabus body + `ActivateJourneyInput`            | No `styleId`; style read from `journey.styleId`                                        | Remove all `styleId` references                                         |
| Synthetic applied-change message persisted                     | Synthetic message stripped (never persisted); fed to model ephemerally                 | Persist it with `metadata` + hide in UI (§3)                            |
| `messages` has a `phase` column                                | No `phase`; scope is `(journeyId, chapterId)`, `chapterId IS NULL` = syllabus          | Aligned                                                                 |
| —                                                              | `messages` has **no `metadata` column**                                                | **Add `metadata` column** (migration) to persist synthetic/hidden flags |

---

## 1. Schema — add a `metadata` column

File: `lib/server/db/schema.ts` (messages table, lines 83-98).

Add a nullable JSONB `metadata` column so a message's UI-level metadata
(including a synthetic/hidden marker) survives a reload — required for §3.

```ts
metadata: jsonb('metadata').$type<UIMessage['metadata']>(),
```

Generate the migration with `pnpm drizzle-kit generate` (never hand-edit the
journal/snapshots). No data backfill needed — existing rows get `NULL`.

---

## 2. Entity layer — delta-native primitives

Target: `lib/server/messages/`. Current files: `get.ts`, `get.test.ts`,
`sync.ts`, `sync.test.ts`, `index.ts`.

### Remove

- Delete `sync.ts` and `sync.test.ts`; drop the `syncMessages` /
  `SyncMessagesParams` re-exports from `index.ts`.

### `getMessages` — extend

Keep the signature, but read and return `metadata` on each `UIMessage` (so the
UI can tell synthetic messages apart on reload). Ordering, scope predicate, and
role filtering are unchanged.

### Add `lib/server/messages/save.ts`

```ts
/** Parameters for appending messages to a conversation scope. */
export type SaveMessagesParams = {
  journeyId: string;
  /** `null` = syllabus chat scope; a chapter id = chapter chat scope. */
  chapterId: string | null;
  /** Messages to insert. Existing ids are updated (idempotent on retry). */
  messages: UIMessage[];
};

/**
 * Inserts messages into a conversation scope. Upserts by id so a retried
 * request does not duplicate rows. Persists `metadata` alongside role/parts.
 * Does not delete — callers truncate with {@link deleteMessagesFrom} first.
 */
export async function saveMessages(params: SaveMessagesParams): Promise<void>;
```

One statement:
`insert(...).values(... role, parts, metadata ...).onConflictDoUpdate({ target: id, set: { role, parts, metadata } })`.
Mirrors the insert half of today's `syncMessages` (sync.ts:52-69) plus the new
`metadata` field.

### Add `lib/server/messages/delete.ts`

```ts
/** Parameters for truncating a conversation from a given message onwards. */
export type DeleteMessagesFromParams = {
  journeyId: string;
  /** `null` = syllabus chat scope. */
  chapterId: string | null;
  /** First message to delete (inclusive). Later messages in the scope are also
   *  deleted. A no-op when this id is absent from the scope. */
  fromMessageId: string;
};

/**
 * Deletes a message and every later message in the same scope. Truncates stored
 * history when a past message is edited or an assistant turn is regenerated.
 * Safe when `fromMessageId` is absent — the call is a no-op.
 */
export async function deleteMessagesFrom(
  params: DeleteMessagesFromParams,
): Promise<void>;
```

`DELETE … WHERE` scope
`AND created_at >= (SELECT created_at FROM messages WHERE id = fromMessageId)`.
Absent id → subquery `NULL` → `created_at >= NULL` is falsy → no rows deleted.
Reuse the scope predicate from sync.ts:32-38.

### Barrel `index.ts`

```ts
export { getMessages, type GetMessagesParams } from './get';
export { saveMessages, type SaveMessagesParams } from './save';
export { deleteMessagesFrom, type DeleteMessagesFromParams } from './delete';
```

---

## 3. Synthetic messages — persist + hide (the key design decision)

**Why not the ephemeral approach.** Research against the Anthropic Messages API
and AI SDK v6 (sourced):

- The `messages` array must be non-empty and **start with a `user` turn**. There
  is no "system prompt only" mode, so the model cannot speak first without a
  user message. The `'Begin.'` cue is the only supported assistant-first
  pattern.
- Trailing-assistant "prefill" returns **400 on Sonnet 4.6** (our model), so we
  cannot continue from an assistant message either — a turn must end on
  user/tool-result.
- `convertToModelMessages` uses only `role` + `parts`; it **ignores
  `metadata`**. So a `metadata` flag is invisible to the model but available to
  the UI.

Therefore synthetic cue messages are **persisted as real rows** (so they are in
the DB-assembled model context and survive reload) and **flagged in `metadata`**
so the UI can hide or specially-render them. This also fixes a latent issue: the
stored history becomes `user`-first on every reload (today's ephemeral
`'Begin.'` only satisfies the API on the live turn, not after a refresh).

### Metadata convention

Model the two synthetic cases on **two orthogonal axes** — "render it?" and "is
it an action?" — rather than one closed enum. A `start-cue` is hidden and not an
action; an applied change is visible (as a breadcrumb) and is an action. These
are independent, so use two flags:

```ts
/**
 * UI-level metadata for chat messages. Ignored by the model
 * (`convertToModelMessages` reads only `role` + `parts`) but persisted so
 * reloaded history renders faithfully.
 */
type ChatMessageMetadata = {
  /**
   * When true, the message is persisted and fed to the model for context but is
   * never rendered in the transcript. Used for server-authored cues such as the
   * assistant-first `'Begin.'` opener.
   */
  hidden?: boolean;
  /**
   * Marks a message as representing a user action rather than authored prose;
   * rendered as a `MessageEvent` breadcrumb instead of a chat bubble. The value
   * names the action (e.g. `'syllabusChangeApplied'`) so future rendering,
   * styling, or analytics can branch on it without widening a closed union.
   */
  action?: string;
};
```

Mapping of today's two cases:

- start cue → `{ hidden: true }`
- applied syllabus change → `{ action: 'syllabusChangeApplied' }`

**Location & typing:** one shared `ChatMessageMetadata` type, defined in the
`lib/journey-chat` feature module and exposed through its barrel
(`lib/journey-chat/index.ts`). `action` is a free `string` for forward
extensibility. The chat routes and `chapter-page.tsx` import it from
`@/lib/journey-chat` — this replaces the route-local `ChapterChatMetadata` type.

### UI rendering — `lib/journey-chat/view.tsx`

Today the map (view.tsx ~277) renders every message and special-cases
`metadata.type === 'action'` into a `<MessageEvent>` — which does **not** match
the current `'action-syllabusChangeApplied'` value (a latent mismatch to fix).
Replace with a helper above the `return` that branches on the two flags, in
order (keep the existing `typeof metadata === 'object' && metadata !== null`
guards before reading fields):

- `metadata.hidden === true` → filter out (render nothing).
- `metadata.action !== undefined` → render as
  `<MessageEvent key={msg.id}>{text}</MessageEvent>`.
- otherwise → normal bubble.

The breadcrumb text keeps coming from the message's own `parts` (the translated
`proposalAppliedMessage`), not from the metadata value — `action` is only a
routing marker. `MessageEvent` (`components/ai-elements/message.tsx:415`) is
reused as-is.

### Where synthetic messages originate

- **Start cue (chapter assistant-first):** server-authored. On the start signal
  (empty delta, empty DB history), the route builds a
  `{ role: 'user', parts: [{ type: 'text', text: 'Begin.' }], metadata: { hidden: true } }`
  message, `saveMessages` it, then assembles context from `getMessages`.
  Replaces the ephemeral `startCue` model-message (route lines 73, 146-153).
- **Applied-change cue:** client-authored, now **sent over the wire** and
  persisted. `handleSyllabusApplied` (chapter-page.tsx:57-68) keeps building the
  message with `metadata: { action: 'syllabusChangeApplied' }` (replacing the
  current `{ type: 'action-syllabusChangeApplied' }`), then triggers a send
  (e.g. `triggerResponse()` after `setMessages`) so it becomes the delta. The
  translated `proposalAppliedMessage` stays in the message `parts`.
  `stripSyllabusChangeContent`'s **user-message branch is removed** — the cue is
  no longer stripped from persistence.

Assistant `tool-proposeSyllabusChange` parts keep being stripped before save
(unchanged product behaviour: the proposal card is a one-time action, not
durable history). `stripSyllabusChangeContent` shrinks to only that
assistant-part strip.

---

## 4. Unified server algorithm

After auth/ownership checks, both routes follow:

```
parse body → { message?, regenerateFromMessageId? }

if regenerateFromMessageId:
    deleteMessagesFrom({ journeyId, chapterId, fromMessageId: regenerateFromMessageId })
else if message:
    deleteMessagesFrom({ journeyId, chapterId, fromMessageId: message.id })   // no-op when new; truncates on edit
    saveMessages({ journeyId, chapterId, messages: [message] })               // persists metadata too
else:                                                                          // start signal
    if chapter and DB history empty:
        saveMessages({ journeyId, chapterId, messages: [startCueMessage] })    // §3 hidden start cue
    else: 400 (syllabus has no start signal)

history       = getMessages({ journeyId, chapterId })          // includes synthetic rows
modelMessages = convertToModelMessages(history)                // metadata ignored; cue text reaches model
// annotate last model message with the ephemeral cache option
stream → onFinish: saveMessages({ journeyId, chapterId, messages: persist(response.messages) })
```

No `ephemeralTail`, no special model-context injection: context is **always**
`convertToModelMessages(getMessages(...))`. `persist(...)` strips assistant
`tool-proposeSyllabusChange` parts on the chapter route (identity on syllabus).
`onFinish` saves only this turn's new assistant messages — the user/edited
message was already persisted before streaming.

---

## 5. Syllabus chat route

File: `app/api/journeys/[journeyId]/syllabus/chat/route.ts`.

- Add `RouteContext = { params: Promise<{ journeyId: string }> }`; read
  `journeyId` from `context.params`. Remove it from `RequestBody`.
- New body type / schema:

```ts
export type RequestBody = {
  /** New or edited user message. Absent for regenerations. */
  message?: UIMessage;
  /** Assistant message id to replace. Present for regenerations only. */
  regenerateFromMessageId?: string;
  locale: Locale;
};
```

- Validate **exactly one** of `message` / `regenerateFromMessageId`, else 400.
  Validate the single message with `validateUIMessages` (wrap in an array).
- Keep auth, `getJourney`, `status === 'drafting'` → 409, and
  style/system-prompt composition (style from `journey.styleId`, unchanged).
- Apply §4 with `chapterId: null` (no synthetic handling on this route).
- `initialUserMessage` effort heuristic counts user messages in the **assembled
  history**: `history.filter(m => m.role === 'user').length === 1`.
- `onFinish` →
  `saveMessages({ journeyId, chapterId: null, messages: response.messages })`.

---

## 6. Chapter chat route

File: `app/api/journeys/[journeyId]/chapters/[chapterId]/chat/route.ts`.

Same conversion with `chapterId` from the path. New body:

```ts
export type RequestBody = {
  message?: UIMessage<ChatMessageMetadata>;
  regenerateFromMessageId?: string;
  locale: Locale;
};
```

Import `ChatMessageMetadata` from `@/lib/journey-chat`; delete the route-local
`type ChapterChatMetadata = ...` (route.ts:29).

- Neither field present → **start signal**: if DB history is empty, persist the
  hidden `{ hidden: true }` start cue (§3) before assembling; the assembled
  history is now `user`-first so no model-message injection is needed.
- Keep `chapter.status === 'locked'` → 404 and the `style` check.
- `persist(...)` in `onFinish` keeps stripping assistant
  `tool-proposeSyllabusChange` parts (the shrunken
  `stripSyllabusChangeContent`).
- The applied-change cue arrives as a normal `message` with
  `metadata.action === 'syllabusChangeApplied'` and is persisted like any other
  message.

---

## 7. Client transport — `useJourneyChat`

File: `lib/journey-chat/use-journey-chat.ts`
(`new DefaultChatTransport({ api })`, line 63).

Extract a pure, unit-testable helper and wire it in:

`lib/journey-chat/prepare-request.ts`

```ts
import 'client-only';

export function prepareChatRequest({ messages, trigger, messageId, body }): {
  body: Record<string, unknown>;
} {
  if (trigger === 'regenerate-message') {
    return { body: { ...body, regenerateFromMessageId: messageId } };
  }
  // submit-message: new message, edit (same id; server detects via DB lookup),
  // or assistant-first start (empty messages → no `message` → start signal).
  const last = messages.at(-1);
  return {
    body: last === undefined ? { ...body } : { ...body, message: last },
  };
}
```

```ts
transport: new DefaultChatTransport({ api, prepareSendMessagesRequest: prepareChatRequest }),
```

No change to the hook's public surface; `handleSubmit` / `handleEditMessage` /
`handleRegenerate` / `triggerResponse` keep merging `{ locale, ...body }`. Edits
keep the original id (SDK preserves it), so the server distinguishes new vs.
edit inside `deleteMessagesFrom`. `triggerResponse()` on an empty chapter sends
no `message` → start signal. The applied-change flow (§3) calls a send so the
cue becomes `messages.at(-1)`.

---

## 8. `activateJourneyAction`

File: `app/[locale]/journeys/[journeySlug]/syllabus/activate-journey.ts`.

History lives in the DB, so read it server-side instead of trusting the client:

```ts
export type ActivateJourneyInput = { journeyId: string; syllabus: Syllabus };
```

```ts
const messages = await getMessages({
  journeyId: input.journeyId,
  chapterId: null,
});
const { title, memory } = await bootstrapJourney({
  draft: syllabus,
  messages,
  locale,
});
```

`bootstrapJourney` (lib/syllabus-chat/bootstrap.ts) is unchanged. Caller
`syllabus-chat.tsx` (lines 90-103) stops passing `messages`:
`activateJourneyAction({ journeyId: journey.id, syllabus })`.

---

## 9. Files touched

Review order:

1. `lib/server/db/schema.ts` — add `metadata` column;
   `pnpm drizzle-kit generate`
2. `lib/server/messages/save.ts` (+ `save.test.ts`) — new primitive
3. `lib/server/messages/delete.ts` (+ `delete.test.ts`) — new primitive
4. `lib/server/messages/get.ts` (+ `get.test.ts`) — return `metadata`
5. `lib/server/messages/index.ts` — barrel (drop sync, add save/delete)
6. Delete `lib/server/messages/sync.ts` + `sync.test.ts`
7. `lib/journey-chat/prepare-request.ts` (+ `prepare-request.test.ts`) — new
8. `lib/journey-chat/use-journey-chat.ts` — wire `prepareSendMessagesRequest`
9. `lib/journey-chat/` — define `ChatMessageMetadata`; export from `index.ts`
10. `lib/journey-chat/view.tsx` — branch on `hidden` then `action` (§3)
11. `app/api/journeys/[journeyId]/syllabus/chat/route.ts` (+ `route.test.ts`)
12. `app/api/journeys/[journeyId]/chapters/[chapterId]/chat/route.ts` (+
    `route.test.ts`)
13. `app/.../syllabus/activate-journey.ts` — read history from DB
14. `app/.../syllabus/syllabus-chat.tsx` — stop passing `messages`
15. `app/.../[chapterSlug]/chapter-page.tsx` — send the applied-change cue

---

## 10. Testing

| File                                                                   | Tests                                                                                                                                                                                                      |
| ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lib/server/messages/save.test.ts`                                     | inserts for syllabus (`null`) + chapter scopes; persists `metadata`; upserts by id (no dup on retry); scope isolation                                                                                      |
| `lib/server/messages/delete.test.ts`                                   | deletes target + all later in scope; no-op when id absent; scope isolation                                                                                                                                 |
| `lib/server/messages/get.test.ts`                                      | returns `metadata`; existing ordering/role-filter cases                                                                                                                                                    |
| `lib/journey-chat/prepare-request.test.ts`                             | `submit-message` non-empty → `{ message: last }`; empty → no `message`; `regenerate-message` → `{ regenerateFromMessageId }`; `body` preserved                                                             |
| `app/api/journeys/[journeyId]/syllabus/chat/route.test.ts`             | 400 when neither/both present; new → `saveMessages`+stream; edit → `deleteMessagesFrom`+`saveMessages`; regenerate → `deleteMessagesFrom` (no save); assistant saved in `onFinish`                         |
| `app/api/journeys/[journeyId]/chapters/[chapterId]/chat/route.test.ts` | start signal → persists `{ hidden: true }` cue, history `user`-first; applied-change cue persisted with `{ action: 'syllabusChangeApplied' }`; assistant `tool-proposeSyllabusChange` stripped before save |

`view.tsx` synthetic-message rendering covered by a focused render test:
`{ hidden: true }` renders nothing; `{ action: 'syllabusChangeApplied' }`
renders a `MessageEvent` with the message's text; no/empty metadata renders a
normal bubble.

### End-to-end verification

1. `pnpm drizzle-kit generate` produces a single add-column migration;
   `pnpm lint` and `pnpm test` green.
2. `pnpm dev`, devtools open. **Syllabus chat:** send → body is only
   `{ message, locale }` (no array); edit → only edited message sent, later rows
   deleted; regenerate → `{ regenerateFromMessageId, locale }`, prior assistant
   row replaced; reload → history restores.
3. Activate the journey → title/memory still derive correctly (history read
   server-side).
4. **Chapter chat:** open a fresh chapter → assistant speaks first; confirm the
   start-cue row exists in the DB with `metadata = { "hidden": true }` (hidden
   in UI) and history is `user`-first after reload. Apply a proposed syllabus
   change → assistant responds; the row persists with
   `metadata = { "action": "syllabusChangeApplied" }`, shows as a breadcrumb,
   and survives reload; the proposal tool part is not persisted.
   Edit/regenerate/reload behave as in step 2.
