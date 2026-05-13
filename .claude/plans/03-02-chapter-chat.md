# Story 2 — Chapter Chat (D3.2)

## Context

Story 1 of D3 (see `.claude/plans/03-chapter-page.md`) lands the chapter
route, the redirect from the journey URL, and a two-column chapter page whose
main column currently shows a `t('Chapter.chatComingSoon')` placeholder. The
sidebar already hosts `StylePickerPersist` and a `ChapterSyllabusPanel`.

Story 2 fills that placeholder with the real thing: a streaming AI
conversation, scoped to one chapter, with full awareness of the journey's
syllabus, the learner memory, the chapter content, and the current teaching
style. The model can silently refine `journeys.memory` mid-session via an
`updateMemory` tool. No other tools are wired in this story.

What stays deferred:

- `markChapterComplete` tool + the "Go to next chapter" UI — **Story 3**.
- `proposeSyllabusChange` tool + the confirm dialog + `applySyllabusChangeAction` — **Story 4**.
- Persisting chat history (`messages` table, reload on refresh) — **Story 5**.

Story 2's chat history is **ephemeral** in exactly the same way the welcome
(syllabus) chat is: closing the tab or refreshing the page wipes the
conversation. The persisted state Story 2 produces is limited to whatever
`journeys.memory` mutations the model performs.

---

## Decisions

- **Route shape: `POST /api/journeys/[id]/chapters/[n]/chat`.** `[id]` is the journey nanoid, `[n]` is the **1-based** chapter number from the URL (matches `chapterPath` and the visible "Chapter N" numbering). The handler converts `n` to a 0-based `idx` for DB lookup.
- **Auth via Clerk `auth()`; 401 when signed out; 404 when journey/chapter missing or chapter is `locked`; 400 on a malformed body.** Mirrors `app/api/syllabus/chat/route.ts` exactly.
- **Body validated with Zod**: `{ messages: UIMessage[], locale: 'en' | 'fr' }`. Unlike the syllabus chat there is no `styleId` in the body — the chapter's style is whatever is currently stored on `journeys.styleId`, fetched server-side. Avoids drift between the picker UI and the server prompt and ties tool execution to persisted state.
- **Locale-monolingual prompts.** Locale comes from the request body. Style fragments are looked up via `getStyle()` and the `[locale]` index, like the syllabus chat.
- **Feature module under `lib/chapter-chat/`** with `prompts.ts` and `tools.ts`. Tool descriptions are inline English, not localized.
- **`updateMemory` does a full replacement of the Markdown memory string** — no JSON Patch, no merge. The Zod schema is just `{ memory: string }`. Matches the project decision that memory is a Markdown blob.
- **Tool execution gets `userId` + `journeyId` via closure.** The route handler constructs the `updateMemory` tool inside the request scope, capturing the authenticated `userId` and the resolved `journeyId`; the tool's `execute` calls a new pure entity function `updateJourneyMemory({ userId, journeyId, memory })`. Tool inputs themselves only carry the new memory text.
- **Plain `'anthropic/claude-sonnet-4-6'` model string via AI Gateway.** No `@ai-sdk/anthropic` imports. Same `streamText` + ephemeral cache + adaptive thinking shape as `app/api/syllabus/chat/route.ts`.
- **Effort: `'low'` for chapter chat (no first-turn boost).** Per Anthropic's [Sonnet 4.6 effort guidance](https://platform.claude.com/docs/en/build-with-claude/effort): *"Low effort … for chat and non-coding use cases where faster turnaround is prioritized."* The syllabus phase used `effort: 'max'` on the first turn because the model had to design a coherent syllabus from scratch — chapter chat has no equivalent burst-of-planning moment; every turn is conversational teaching. Adaptive thinking stays on, so the model still escalates internally when a learner asks a genuinely hard question; the soft cap only nudges defaults. We also append a one-line prompt hint per Anthropic's documented pattern: *"Extended thinking adds latency and should only be used when it will meaningfully improve answer quality. When in doubt, respond directly."* The lower effort also discourages over-eager `updateMemory` calls (effort affects tool-call frequency too).
- **`updateMemory` tool parts render as nothing.** The client message mapper renders only `text` parts (same `part.type !== 'text' ? null : …` filter as `welcome-chat.tsx`).
- **`ChapterChat` is a client island.** The chapter page (server component) passes `journey` + `chapter` props down. The client uses `useChat` from `@ai-sdk/react` with `DefaultChatTransport`, posts to `/api/journeys/${journey.id}/chapters/${chapter.idx + 1}/chat`, and sends `locale` in each request body.
- **Chat region uses the shared `ChatScaffold`.** Story 1 introduced `components/chat-page-shell.tsx` and `components/syllabus-panel.tsx`. Story 2 extracts the third shared piece — `components/chat-scaffold.tsx` — owning the Conversation + Message-mapping + PromptInput stack. Both the welcome page and the chapter page render through it; the only per-page difference is the `renderPart` callback (welcome filters to text only; chapter does the same in Story 2 and adds the completion-button branch in Story 3). Retrofit `welcome-chat.tsx` to consume the scaffold in this same diff so the two layouts stay aligned by construction.
- **`getJourney` must expose `memory`.** Today's select list omits it. Story 2 adds `memory: journeys.memory` to the select and adds a `memory: string` field to the `Journey` type so the chat route handler can read it without an extra round-trip. No migration needed — `memory` is already `notNull().default('')`.
- **No new tests** beyond keeping `messages/parity.test.ts` green. Verified manually end-to-end (chat streams, memory writes land in DB).

---

## Files to modify

### 1. `lib/server/journeys/get.ts` — surface `memory`

Add `memory: journeys.memory` to the journey row select, and add a `memory: string` field to the `Journey` type.

```ts
export type Journey = {
  id: string;
  title: string;
  styleId: string;
  memory: string;
  syllabus: Syllabus;
  chapters: JourneyChapter[];
};
```

JSDoc the new field: `/** Markdown learner memory for the journey. */`.

No callers break — Story 1's chapter page and the welcome flow only read `chapters`, `syllabus`, `title`, `id`, `styleId`.

### 2. `lib/server/journeys/updateMemory.ts` — new entity function

Mirror `setStyle.ts` exactly. Scoped UPDATE by `(id, userId)` so an authenticated request for a journey owned by a different user is a no-op (no leak, no error).

```ts
import { and, eq } from 'drizzle-orm';

import { db } from '@/lib/server/db';
import { journeys } from '@/lib/server/db/schema';

/** Parameters for replacing a journey's learner memory. */
export type UpdateJourneyMemoryInput = {
  /** Clerk user ID — scopes the update to the owner. */
  userId: string;
  /** Journey ID to update. */
  journeyId: string;
  /** New Markdown memory string (full replacement). */
  memory: string;
};

/**
 * Replaces the Markdown learner memory of a journey.
 * Scoped to the owner so unauthorised users cannot mutate other journeys.
 *
 * @param input - Owner ID, journey ID, and new memory string.
 */
export async function updateJourneyMemory({
  userId,
  journeyId,
  memory,
}: UpdateJourneyMemoryInput): Promise<void> {
  await db
    .update(journeys)
    .set({ memory })
    .where(and(eq(journeys.id, journeyId), eq(journeys.userId, userId)));
}
```

### 3. `lib/chapter-chat/prompts.ts` — new

Mirrors `lib/syllabus-chat/prompts.ts`. Composes the chapter-phase system prompt from: the style fragment for the locale, a chapter-phase rules block in the locale, the full syllabus (chapter titles only — keeps the prompt compact), the current chapter's title + summary + sections, and the learner memory verbatim.

```ts
import type { Locale } from '@/i18n/locale';
import type { Journey, JourneyChapter } from '@/lib/server/journeys/get';
import type { Style } from '@/lib/server/styles/get';

const chapterPhase: Record<Locale, string> = {
  en: `You are teaching a single chapter of an ongoing learning journey.

Stay scoped to the current chapter. If the learner asks about content from another chapter, briefly redirect them and continue teaching the current one. Use the chapter title, summary, and sections below as the source of truth for what to cover.

You have access to the full syllabus only to keep your bearings, not to wander into later chapters. Treat the syllabus as immutable in this story — you cannot edit it.

You have a private \`updateMemory\` tool. Use it when you learn something durable about the learner (clarified goal, new gap, pace preference, confusion pattern, etc.). Always pass the FULL updated Markdown memory — this is a replacement, not a patch. Never mention the tool to the learner; the update is silent.`,
  fr: `Vous enseignez un seul chapitre d'un parcours d'apprentissage en cours.

[mirror French phrasing — same structure, second person, mention l'outil updateMemory et rappeler que c'est un remplacement complet, jamais mentionné à l'apprenant]`,
};

/** Parameters for composing the chapter-phase system prompt. */
export type ComposeChapterSystemPromptParams = {
  /** Teaching style whose fragment is prepended. */
  style: Style;
  /** Locale used to select the correct language variant. */
  locale: Locale;
  /** The hydrated journey (for syllabus + memory context). */
  journey: Journey;
  /** The chapter the learner is currently in. */
  chapter: JourneyChapter;
};

/**
 * Builds the system prompt for the chapter-chat phase.
 *
 * @param params - Style, locale, journey, and chapter.
 * @returns The full system prompt string.
 */
export function composeChapterSystemPrompt({
  style,
  locale,
  journey,
  chapter,
}: ComposeChapterSystemPromptParams): string {
  const styleFragment = style.systemPromptFragments[locale];
  const syllabusOutline = journey.syllabus.chapters
    .map((c, i) => `${i + 1}. ${c.title}`)
    .join('\n');
  const fullChapter = journey.syllabus.chapters[chapter.idx];
  const sections =
    fullChapter?.sections !== undefined && fullChapter.sections.length > 0
      ? `\nSections:\n${fullChapter.sections.map((s) => `- ${s}`).join('\n')}`
      : '';
  const summary =
    fullChapter?.summary !== undefined ? `\n\n${fullChapter.summary}` : '';

  return `${styleFragment}

${chapterPhase[locale]}

# Journey: ${journey.title}

## Syllabus
${syllabusOutline}

## Current chapter (${chapter.idx + 1} of ${journey.chapters.length})
${chapter.title}${summary}${sections}

## Learner memory
${journey.memory.trim() === '' ? '_(empty)_' : journey.memory}`;
}
```

Rationale for "chapter titles only" in the syllabus block: full per-chapter detail for every chapter would bloat the prompt and dilute focus on the *current* chapter. Story 4 (syllabus-change) will reuse this composer; expand context there if needed.

### 4. `lib/chapter-chat/tools.ts` — new

Tool **factory** that closes over `userId` and `journeyId`. The factory pattern is the project's idiom for tools that need request-scoped DB access.

```ts
import { tool } from 'ai';
import { z } from 'zod';

import { updateJourneyMemory } from '@/lib/server/journeys/updateMemory';

/** Parameters for building the chapter-chat `updateMemory` tool. */
export type CreateUpdateMemoryToolParams = {
  /** Clerk user ID of the owner of the journey. */
  userId: string;
  /** Journey whose memory may be replaced. */
  journeyId: string;
};

/**
 * Builds an AI SDK tool that lets the model replace the learner memory of
 * the current journey. The journey and owner are captured at construction
 * time so the model can only mutate the journey it is currently teaching.
 *
 * @param params - Owner ID and journey ID for the active chat.
 * @returns A request-scoped `updateMemory` tool.
 */
export function createUpdateMemoryTool({
  userId,
  journeyId,
}: CreateUpdateMemoryToolParams) {
  return tool({
    description: `Replace the entire learner memory for this journey with a new Markdown string.

Rules:
- Always pass the FULL updated memory — this is a replacement, not a patch.
- Use the second person ("You want to…", "You already know…").
- Only call this tool when you have learned something durable about the learner: a clarified goal, a confirmed gap, a pace preference, a recurring confusion. Skip ephemeral signals.
- Never mention this tool or the memory update to the learner. The update is silent.`,
    inputSchema: z.object({ memory: z.string().min(1).max(8000) }),
    execute: async ({ memory }) => {
      await updateJourneyMemory({ userId, journeyId, memory });
      return { ok: true };
    },
  });
}
```

### 5. `app/api/journeys/[id]/chapters/[n]/chat/route.ts` — new

Mirrors `app/api/syllabus/chat/route.ts`. Next.js 16 dynamic-param API: `params: Promise<{ id: string; n: string }>` is awaited before use.

Step-by-step:

1. `const { userId } = await auth()`; 401 if null.
2. `const { id, n } = await context.params`; parse `n` to integer ≥ 1, 400 on fail.
3. `await req.json()` + Zod parse `{ messages: unknown[], locale: 'en' | 'fr' }`; 400 on fail.
4. `await ensureUser(userId)`.
5. `const journey = await getJourney({ userId, id })` → 404 if null.
6. `const chapter = journey.chapters.find(c => c.idx === n - 1)`; 404 if missing or `chapter.status === 'locked'`.
7. `const style = getStyle(journey.styleId)`; 400 if null (defensive).
8. `const messages = await validateUIMessages({ messages: parsed.messages })`.
9. Build `system = composeChapterSystemPrompt({ style, locale, journey, chapter })`.
10. Build `tools = { updateMemory: createUpdateMemoryTool({ userId, journeyId: journey.id }) }`.
11. Build `modelMessages` exactly like the syllabus route: prepend `{ role: 'system', content: system, providerOptions: ephemeralCache }`, then `convertToModelMessages(messages)` with `ephemeralCache` stamped on the last message.
12. `streamText({ model: 'anthropic/claude-sonnet-4-6', messages: modelMessages, tools, providerOptions: { anthropic: { thinking: { type: 'adaptive' }, effort: 'low' } }, experimental_transform: smoothStream() })`.
13. `return result.toUIMessageStreamResponse()`.

Export `maxDuration = 60` and a `RequestBody` type for client typing parity with the syllabus route.

No first-turn effort boost. Chapter chat is uniformly conversational and Anthropic explicitly recommends `low` effort for chat use cases on Sonnet 4.6. Adaptive thinking still escalates internally when a turn genuinely warrants it.

**Prompt-level latency hint.** Append one line to the chapter-phase rules block in `prompts.ts` (both locales): *"Extended thinking adds latency and should only be used when it will meaningfully improve answer quality. When in doubt, respond directly."* This is Anthropic's documented pattern for tuning adaptive thinking down via the system prompt and complements the `effort: 'low'` setting.

**Follow-up (out of scope, worth noting).** The syllabus route currently uses `effort: 'max'` on the first user message. Per the same Anthropic guidance, `max` is meant for "genuinely frontier problems" and can lead to overthinking on structured-output tasks. A future tweak — not in this story — is to drop the syllabus first-turn boost to `high` (or omit it; `high` is the default) and let adaptive thinking handle escalation.

### 6a. `components/chat-scaffold.tsx` — new shared chat region

Extract the Conversation + Message + PromptInput stack from `welcome-chat.tsx` into a shared client component used by both pages. This is the third shared building block (after `chat-page-shell` and `syllabus-panel` from Story 1) that locks the two layouts together.

```tsx
'use client';

import type { UIMessage } from 'ai';
import { useTranslations } from 'next-intl';

import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from '@/components/ai-elements/conversation';
import {
  Message,
  MessageContent,
} from '@/components/ai-elements/message';
import {
  PromptInput,
  PromptInputFooter,
  type PromptInputMessage,
  PromptInputSubmit,
  PromptInputTextarea,
} from '@/components/ai-elements/prompt-input';

type Props = {
  /** Chat messages from `useChat`. */
  messages: UIMessage[];
  /** `useChat` status — used to derive streaming + disable input. */
  status: 'streaming' | 'submitted' | 'ready' | 'error';
  /** Placeholder string for the prompt textarea (already localised by caller). */
  placeholder: string;
  /** Called when the user submits a non-empty message. */
  onSubmit: (text: string) => void;
  /**
   * Per-part renderer. Receives the part, the parent message, and whether the
   * message is currently streaming. Return `null` to hide a part.
   */
  renderPart: (
    part: UIMessage['parts'][number],
    ctx: { message: UIMessage; streaming: boolean; index: number },
  ) => React.ReactNode;
};

export function ChatScaffold({
  messages,
  status,
  placeholder,
  onSubmit,
  renderPart,
}: Props) {
  const streaming = status === 'streaming' || status === 'submitted';
  const lastMessage = messages[messages.length - 1];

  const messageItems = messages.map((msg) => {
    const isLast = msg === lastMessage;
    const parts = msg.parts.map((part, i) =>
      renderPart(part, { message: msg, streaming: streaming && isLast, index: i }),
    );
    return (
      <Message key={msg.id} from={msg.role}>
        <MessageContent>{parts}</MessageContent>
      </Message>
    );
  });

  const handleSubmit = ({ text }: PromptInputMessage) => {
    if (text.trim() === '') return;
    onSubmit(text);
  };

  return (
    <>
      <Conversation className="flex-1">
        <ConversationContent>{messageItems}</ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      <PromptInput onSubmit={handleSubmit}>
        <PromptInputTextarea disabled={streaming} placeholder={placeholder} />
        <PromptInputFooter>
          <div />
          <PromptInputSubmit status={status} />
        </PromptInputFooter>
      </PromptInput>
    </>
  );
}
```

Rendered inside `<ChatPageShell>`'s left column slot — no outer wrapper needed (the shell already provides `flex flex-1 flex-col gap-4 overflow-hidden`).

### 6b. `app/[locale]/_components/welcome-chat.tsx` — retrofit to use `ChatScaffold`

Replace the inline Conversation/PromptInput stack with `<ChatScaffold>`. The `renderPart` callback is the existing text-only filter:

```tsx
const renderPart = (
  part: UIMessage['parts'][number],
  { streaming, index }: { message: UIMessage; streaming: boolean; index: number },
) => {
  if (part.type !== 'text') return null;
  return (
    <MessageResponse key={index} isAnimating={streaming}>
      {part.text}
    </MessageResponse>
  );
};
```

The chat region inside `<ChatPageShell>` becomes:

```tsx
<ChatScaffold
  messages={messages}
  status={status}
  placeholder={t('promptPlaceholder')}
  onSubmit={(text) => void sendMessage({ text }, { body: { styleId, locale } })}
  renderPart={renderPart}
/>
```

### 6c. `app/[locale]/journeys/[journeySlug]/[chapterSlug]/_components/chapter-chat.tsx` — new

Client island built on the same scaffold.

```tsx
'use client';

import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, type UIMessage } from 'ai';
import { useLocale, useTranslations } from 'next-intl';

import { ChatScaffold } from '@/components/chat-scaffold';
import { MessageResponse } from '@/components/ai-elements/message';
import { parseLocale } from '@/i18n/locale';
import type { Journey, JourneyChapter } from '@/lib/server/journeys/get';

type Props = {
  journey: Journey;
  chapter: JourneyChapter;
};

export function ChapterChat({ journey, chapter }: Props) {
  const t = useTranslations('ChapterChat');
  const locale = parseLocale(useLocale());

  const { messages, sendMessage, status } = useChat({
    transport: new DefaultChatTransport({
      api: `/api/journeys/${journey.id}/chapters/${chapter.idx + 1}/chat`,
    }),
  });

  const renderPart = (
    part: UIMessage['parts'][number],
    { streaming, index }: { message: UIMessage; streaming: boolean; index: number },
  ) => {
    if (part.type === 'text') {
      return (
        <MessageResponse key={index} isAnimating={streaming}>
          {part.text}
        </MessageResponse>
      );
    }
    return null; // tool-updateMemory parts hidden in Story 2
  };

  return (
    <ChatScaffold
      messages={messages}
      status={status}
      placeholder={t('promptPlaceholder')}
      onSubmit={(text) => void sendMessage({ text }, { body: { locale } })}
      renderPart={renderPart}
    />
  );
}
```

The `renderPart` callback is the only place the chapter chat diverges from the welcome chat. Story 3 will extend its `renderPart` to surface the `markChapterComplete` button; no scaffold change needed.

### 7. `app/[locale]/journeys/[journeySlug]/[chapterSlug]/_components/chapter-page.tsx` — mount the chat

Replace this line from Story 1:

```tsx
<p className="text-muted-foreground">{t('Chapter.chatComingSoon')}</p>
```

with:

```tsx
<ChapterChat journey={journey} chapter={chapter} />
```

No layout adjustments needed: `ChatPageShell` already provides `flex flex-1 flex-col gap-4 overflow-hidden` for the left column, and `ChatScaffold` slots in directly without an extra wrapper — same shape as the welcome page. The chapter title block stays as the first child of the column; the scaffold takes the remaining height via its `flex-1` Conversation. Import `ChapterChat` from the same `_components/` directory.

### 8. `messages/en.json` + `messages/fr.json`

- Add a top-level `ChapterChat` namespace.
- Remove `Chapter.chatComingSoon` (no longer rendered anywhere).

```json
"ChapterChat": {
  "promptPlaceholder": "Ask anything about this chapter…"
}
```

French: `"Posez vos questions sur ce chapitre…"`.

`messages/parity.test.ts` enforces structural equality, so both files must add/remove keys in the same commit.

---

## Critical files reference

- **Streaming route pattern**: `app/api/syllabus/chat/route.ts` — auth, Zod body validation, `validateUIMessages`, ephemeral cache, `streamText`, `toUIMessageStreamResponse()`. Story 2's handler is a near-clone with a different prompt composer, a different tool set, and an additional journey/chapter resolution step.
- **Feature module shape**: `lib/syllabus-chat/{prompts,tool}.ts` — layout, `Record<Locale, string>` constants, inline tool description in English, JSDoc style for exported types and functions. `lib/chapter-chat/{prompts,tools}.ts` follows the same conventions.
- **Client chat pattern**: `app/[locale]/_components/welcome-chat.tsx` — `useChat` + `DefaultChatTransport`, sending extra fields via `sendMessage(..., { body: { ... } })`, AI Elements `Conversation`/`Message`/`MessageResponse`, filtering non-text parts, disabling the textarea during stream.
- **Entity-layer pattern**: `lib/server/journeys/setStyle.ts` — scoped UPDATE on `(id, userId)`, named input type, JSDoc. `updateMemory.ts` follows the same shape.
- **Schema reference**: `lib/server/db/schema.ts` — `journeys.memory` is `text('memory').notNull().default('')`. No migration needed.
- **Style + locale plumbing**: `lib/server/styles/get.ts` (`getStyle`, `listPresets`), `i18n/locale.ts` (`parseLocale`, `Locale`). Reused unchanged.
- **AI Elements**: `components/ai-elements/{conversation,message,prompt-input}.tsx` — already wired through the welcome chat; `MessageResponse` wraps Streamdown with code/math/mermaid/cjk plugins.

---

## Verification

Manual walkthrough in `pnpm dev`, both locales:

1. **Happy path (en).** Build a syllabus in `/en/`, start a journey. The redirect lands on `/en/journeys/<jslug>-<jid>/1-<cslug>`. Type a question — assistant streams a reply in the main column. Streamdown renders Markdown (code fences, lists) progressively.
2. **System prompt sanity.** The assistant should not propose to skip ahead to a later chapter, and should reference the chapter title/sections when asked "what are we covering". Optional sanity probe: ask it to enumerate the syllabus — it should produce the chapter outline you authored.
3. **`updateMemory` writes land in DB.** Open `pnpm drizzle-kit studio`, watch `journeys.memory` for the active journey. Tell the chat something durable about yourself ("I already know JavaScript; I just want the Python differences"). After 1–3 turns the model should silently call `updateMemory`; the studio cell updates to a Markdown blob containing that fact. The chat UI shows **no** visible indication of the tool call.
4. **Memory persistence across reloads.** Refresh the chapter page. Chat history is gone (expected — ephemeral), but the journey object the server prompt composer sees on the next first message includes the updated memory. Confirm by asking "what do you know about me?" — the assistant should paraphrase the memory it persisted earlier.
5. **Locked chapter still 404.** From Story 1: visit a locked chapter URL directly — Next.js not-found. As defense-in-depth, hit the route handler directly while the chapter is locked: `curl -X POST -H 'Cookie: …' /api/journeys/<id>/chapters/2/chat …` — must 404.
6. **401 when signed out.** `curl -X POST /api/journeys/<id>/chapters/1/chat -d '{...}'` with no Clerk session — 401.
7. **400 on malformed body.** Same endpoint with `{}` — 400.
8. **Locale (fr).** Repeat steps 1–4 on `/fr`. Assistant responses must contain no English words. The system prompt + style fragment + chapter-phase rules all flow through the French branch.
9. **Style persistence still works.** Change the style from the chapter sidebar; reload; ask the next question — the response tone should reflect the new style fragment (the route handler fetches `journey.styleId` fresh per request, not from the client).

Automated:

- `pnpm lint` — Prettier + ESLint clean.
- `pnpm test` — `messages/parity.test.ts` still passes after the en/fr key changes; the Story 1 `lib/url.test.ts` still passes (untouched).
- `pnpm build` — Next.js production build succeeds with the new dynamic route segments `app/api/journeys/[id]/chapters/[n]/chat/route.ts`.
