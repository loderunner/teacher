# Chapter Chat Persistence — building on syllabus persistence

## Context

The chapter chat is the only chat surface in the app whose history still lives
purely in client memory: refreshing a chapter page, navigating away and back, or
returning to a done chapter all wipe the transcript. The original plan for this
work — `.claude/plans/03-05-message-persistence.md` — assumed an
incremental-save schema (a `chat_phase` enum, a `chat_role` enum, separate
`saveChatMessage` / `deleteMessagesFrom` / `listChapterMessages` primitives).

In the meantime, syllabus chat persistence shipped with a different, simpler
shape: a single `messages` table keyed only by `(journeyId, chapterId)` (where
`chapterId IS NULL` means "syllabus scope"), and two entity functions —
`getMessages` and `syncMessages` (transactional full-sync). The syllabus chat
already uses this pattern end-to-end:

- `lib/server/messages/get.ts` and `lib/server/messages/sync.ts` are
  chapter-aware already (their `chapterId` parameter is `string | null`).
- `app/api/journeys/[journeyId]/syllabus/chat/route.ts` calls `syncMessages`
  before `streamText` and again inside `onFinish`.
- `app/[locale]/journeys/[journeySlug]/syllabus/page.tsx` loads
  `initialMessages` via `getMessages` and threads them through `SyllabusChat` →
  `useJourneyChat` → `useChat`.
- `lib/journey-chat/use-journey-chat.ts` already accepts
  `initialMessages?: UIMessage[]` and forwards it to `useChat`.

What's missing is wiring the **chapter** chat into the same machinery — and two
server actions that today either ignore persistence (`applySyllabusChange`) or
accept transcripts from the client (`completeChapter`).

The goal: a chapter chat that survives refresh / navigation / return-after-done
exactly the way the syllabus chat does, with no new primitives — only new
callers of the existing ones. This supersedes the old plan; we explicitly do
**not** introduce `chat_phase` / `chat_role` enums, `saveChatMessage`,
`listChapterMessages`, or `deleteMessagesFrom`.

---

## Approach

Mirror the syllabus chat persistence pattern at every layer of the chapter chat,
plus strip `tool-proposeSyllabusChange` parts before save so reload never
resurrects a one-shot proposal card.

### 1. Chapter chat route — persist around `streamText`

`app/api/journeys/[journeyId]/chapters/[chapterId]/chat/route.ts`

- Import `syncMessages` from `@/lib/server/messages`.
- After validation + auth + `getJourney` + chapter lookup, **call
  `syncMessages({ journeyId, chapterId, messages })`** to persist the
  client-supplied history (with the proposal-strip filter applied — see below).
  Skip when `messages.length === 0` (first-visit assistant-first turn).
- Pass `originalMessages: messages` and `generateMessageId: generateId` to
  `result.toUIMessageStreamResponse(...)` so the SDK builds the merged final
  list correctly (same as the syllabus route).
- Add an `onFinish: async ({ messages: updated }) => { ... }` callback that
  applies the proposal-strip filter and then calls
  `syncMessages({ journeyId, chapterId, messages: filtered })`.
- Wrap the `onFinish` save in `try/catch`; log failures at `error` level. A
  failure there only loses durability for that single assistant turn; the
  response itself has already streamed to the client.

Define one helper inside the route file:

```ts
function stripProposalParts(list: UIMessage[]): UIMessage[] {
  return list.flatMap((m) => {
    if (m.role !== 'assistant') return [m];
    const parts = m.parts.filter(
      (p) => p.type !== 'tool-proposeSyllabusChange',
    );
    if (parts.length === 0) return [];
    return [{ ...m, parts }];
  });
}
```

Apply it at **both** sync sites (pre-stream and `onFinish`). This is the only
chapter-chat-specific filter; the syllabus route does not need it.

The existing `Begin.` start-cue logic for the assistant-first turn stays
unchanged.

### 2. Chapter page — load initial transcript

`app/[locale]/journeys/[journeySlug]/[chapterSlug]/page.tsx`

After resolving `journey` and `chapter` and before rendering `<ChapterPage>`,
fetch the transcript:

```ts
const initialMessages = await getMessages({
  journeyId: journey.id,
  chapterId: chapter.id,
});

return (
  <ChapterPage
    chapter={chapter}
    journey={journey}
    initialMessages={initialMessages}
  />
);
```

The page already has the ownership gate (`getJourney({ userId, id })`); no extra
check is needed inside `getMessages`. `LockedChapterPage` does not need initial
messages — locked chapters cannot have any.

### 3. `ChapterPage` client component — forward `initialMessages`, guard `triggerResponse`

`app/[locale]/journeys/[journeySlug]/[chapterSlug]/chapter-page.tsx`

- Add `initialMessages: UIMessage[]` to `Props` and forward it into
  `useJourneyChat({ api, initialMessages })`.
- Replace the unconditional mount-time `triggerResponse()` with the
  syllabus-style guard: only fire on mount when (a) `initialMessages` is empty
  (brand-new chapter visit), or (b) the last message is `role: 'user'` (we
  loaded a transcript that ends on a user turn — e.g. the synthetic
  syllabus-applied message described below). Skip when the last message is
  `assistant`: the conversation is already in a "model has just responded"
  state. Use the same `triggeredRef` ref pattern the syllabus chat uses.
- Drop the `messages` argument from the `completeChapterAction(...)` call.
- Update `handleSyllabusApplied` to accept the server-generated
  `syntheticMessageId` and use it as the `id` of the message pushed into
  `setMessages`. If the action returned `undefined`, fall back to
  `crypto.randomUUID()` (DB save failed; the local UI still shows the message
  but it won't survive reload).

### 4. `applySyllabusChangeAction` — persist the synthetic user turn

`app/[locale]/journeys/[journeySlug]/[chapterSlug]/apply-syllabus-change.ts`

After the existing `applySyllabusChange` + `getJourney` calls succeed, append
the synthetic "I applied the suggested syllabus change." user message to the DB
so a refresh keeps the model's follow-up context. Strategy mirrors the
syllabus-chat flow (load → mutate → sync):

```ts
const syntheticMessageId = nanoid(); // or generateId() from 'ai'
const t = await getTranslations({
  locale: await getLocale(),
  namespace: 'ChapterChat',
});

try {
  const existing = await getMessages({
    journeyId: parsed.journeyId,
    chapterId: active.id,
  });
  await syncMessages({
    journeyId: parsed.journeyId,
    chapterId: active.id,
    messages: [
      ...existing,
      {
        id: syntheticMessageId,
        role: 'user',
        metadata: { type: 'action' },
        parts: [{ type: 'text', text: t('proposalAppliedMessage') }],
      },
    ],
  });
} catch {
  return { chapterPath: chapterPath(journey, active) };
}

return {
  chapterPath: chapterPath(journey, active),
  syntheticMessageId,
};
```

- Extend `ApplySyllabusChangeResult` with `syntheticMessageId?: string`
  (optional — present only on successful save).
- Use `active.id` as `chapterId` (the chapter the user is currently on, post-
  reconciliation). The proposal can have renamed chapters; `getJourney` returns
  the post-apply state, so `active` is the correct, current chapter row.
- `SyllabusChangeCard` already calls `onApplied(toolCallId)`; it will pass the
  new `syntheticMessageId` through as a second argument. `ChapterPage`'s
  `handleSyllabusApplied` uses it.

### 5. `completeChapterAction` — load transcript from DB

`app/[locale]/journeys/[journeySlug]/[chapterSlug]/complete-chapter.ts`

- Drop `messages` from `CompleteChapterInput` and from the Zod input schema.
- Delete the `validateUIMessages({ messages: parsed.messages })` line.
- After the existing `getJourney` + `chapter` resolution (and after the
  idempotent short-circuit when `chapter.status !== 'active'`), read the
  transcript from the DB:

  ```ts
  const messages = await getMessages({
    journeyId: journey.id,
    chapterId: chapter.id,
  });
  ```

- Pass that `messages` array unchanged into `generateChapterSummary`.
- Remove the "client passes messages to the server action" caveat from the
  JSDoc; the action is now fully server-resolved.

### 6. `useJourneyChat` — no change

Already supports `initialMessages` (`lib/journey-chat/use-journey-chat.ts`).
Only the chapter page needs to start passing it.

### Schema, migrations, enums

No changes. The existing `messages` table already supports
`(journeyId, chapterId)` scoping. We deliberately keep the schema simpler than
the original plan: no `phase` column, no enums.

---

## Critical files to modify

Review in this order:

1. `app/api/journeys/[journeyId]/chapters/[chapterId]/chat/route.ts` — add
   pre-stream and `onFinish` persistence with the proposal-strip filter.
2. `app/[locale]/journeys/[journeySlug]/[chapterSlug]/page.tsx` — fetch
   `initialMessages` via `getMessages` and pass to `<ChapterPage>`.
3. `app/[locale]/journeys/[journeySlug]/[chapterSlug]/chapter-page.tsx` — accept
   and forward `initialMessages`; guard `triggerResponse`; drop `messages` from
   `completeChapterAction`; thread `syntheticMessageId` through
   `handleSyllabusApplied`.
4. `app/[locale]/journeys/[journeySlug]/[chapterSlug]/syllabus-change-card.tsx`
   — forward the new `syntheticMessageId` from the action result to `onApplied`.
5. `app/[locale]/journeys/[journeySlug]/[chapterSlug]/syllabus-change-context.tsx`
   — extend the `onApplied` signature in the context type.
6. `app/[locale]/journeys/[journeySlug]/[chapterSlug]/apply-syllabus-change.ts`
   — persist synthetic user message; return `syntheticMessageId`.
7. `app/[locale]/journeys/[journeySlug]/[chapterSlug]/complete-chapter.ts` —
   drop `messages` input; load via `getMessages`.

Reference (no edits needed):

- `lib/server/messages/get.ts`, `lib/server/messages/sync.ts` — existing
  primitives already chapter-aware.
- `app/api/journeys/[journeyId]/syllabus/chat/route.ts` — the persistence
  pattern to mirror.
- `app/[locale]/journeys/[journeySlug]/syllabus/syllabus-chat.tsx` — the
  `triggerResponse`-on-last-user-message pattern to mirror.
- `lib/journey-chat/use-journey-chat.ts` — already accepts `initialMessages`.

---

## Verification

Manual walkthrough in `pnpm dev`, both locales:

1. **Mid-chapter refresh.** Start a journey, send 3–4 messages, refresh. Full
   transcript reloads in order; sending another message continues the
   conversation. The model has the reloaded history (visible by it referring
   back to earlier turns).
2. **Navigate away and back.** Open another chapter (or the syllabus panel),
   then return. Ch1's transcript is intact.
3. **Done chapter history.** Complete ch1; from ch2 click the ✓-prefixed ch1
   link. The done chapter shows its full transcript. Posting a new message to
   the done chapter still works (the route only 404s on `locked`).
4. **`markChapterComplete` button is idempotent on reload.** Trigger
   `markChapterComplete`, navigate forward, hit Back. The "Go to next chapter"
   button re-renders from the persisted assistant tool part; clicking it
   short-circuits via `completeChapter`'s idempotent branch and `router.push`es
   forward.
5. **Proposal card does not resurrect.** Trigger `proposeSyllabusChange`, do
   nothing, refresh. The card is gone. Confirm in `drizzle-kit studio` that the
   assistant message either does not exist (model fired only the tool) or exists
   with `parts` containing no `tool-proposeSyllabusChange` entry.
6. **Apply syllabus change → synthetic message survives refresh.** Trigger a
   proposal, click Apply. The synthetic "I applied…" user message appears, then
   the page navigates/refreshes. After landing, the synthetic message is in the
   visible transcript (loaded from DB). On the next assistant turn the model has
   the synthetic context.
7. **In-session dismissal still works.** Trigger a proposal, click Dismiss. Send
   more messages — card stays dismissed for the session. Refreshing removes the
   card entirely (proposal part stripped on save).
8. **Cross-user isolation.** Sign in as user B; their journeys load empty
   transcripts. (`getMessages` is gated upstream by `getJourney`'s ownership
   check.)
9. **Locales (en + fr).** Repeat steps 1 and 6 on `/fr`; persisted assistant
   `parts` carry French text; the synthetic message uses French
   `proposalAppliedMessage`.
10. **`onFinish` save failure does not break the response.** Temporarily inject
    a throw in the chapter route's `onFinish` (or add a DB trigger rejecting
    assistant rows on chapter scope). Send a message — assistant reply streams
    and renders; an `error` log line appears; refresh shows the user message but
    not the assistant turn. Revert the trigger.

Automated:

- `pnpm lint` — Prettier + ESLint clean.
- `pnpm test` — existing tests pass (incl. `messages/get.test.ts`,
  `messages/sync.test.ts`). No new test files required (the new logic is all
  glue between already-tested primitives), but adding a small unit test for the
  `stripProposalParts` helper inside the route file would be in line with the
  "tests with new code" preference.
- `pnpm build` — production build succeeds.
