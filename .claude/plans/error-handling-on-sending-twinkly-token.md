# Fix error handling when sending chat messages

## Context

Sending a message can fail (transient network error, 4xx/5xx from the chat
route, provider error mid-stream). Today that failure is handled badly in three
distinct ways:

1. **The hero throws away the user's text.** `PromptInput` calls `form.reset()`
   _before_ awaiting `onSubmit`
   (`lib/components/ai-elements/prompt-input.tsx:894`), so the textarea is
   already empty by the time `createDraftJourneyAction` rejects. Its own `catch`
   blocks say "Don't clear on error — user may want to retry", but for the
   uncontrolled path that is dead code. The user cannot re-submit the same
   prompt after a transient failure.
2. **Retry sends a malformed request.** `JourneyChatView` renders
   `<Button onClick={onRetry}>` (`lib/chat/view.tsx:445`) and `onRetry` is wired
   straight to the hook's `retry` (`chapter-page.tsx:166`,
   `syllabus-chat.tsx:160`). `retry`'s first parameter is `body`
   (`lib/chat/use-journey-chat.ts:117`), so it receives the React
   **MouseEvent**, which is spread into the request body and hits
   `JSON.stringify` inside `DefaultChatTransport` → _"Converting circular
   structure to JSON"_. That is the unrelated-looking error detail reported on
   the chapter chat.
3. **Retry targets the wrong thing even without the event.** `regenerate()` with
   no `messageId` forwards `messageId: undefined`
   (`node_modules/ai/dist/index.mjs:13022`), so `prepareChatRequest` emits
   `{ regenerateFromMessageId: undefined }` — a body with neither `message` nor
   `regenerateFromMessageId`. The syllabus route rejects that with `400`
   (`syllabus/chat/route.ts:65`); the chapter route silently treats it as a
   start signal and re-streams stale history, dropping the user's new message.

Intended outcome:

- The hero keeps the prompt text and stays put unless the draft journey was
  actually created.
- The chat pages keep clearing the textarea on send (the message is added
  optimistically, so the text is not lost), and **Retry** re-drives whichever
  turn actually failed.

### Why we don't need to track persistence client-side

The chat routes persist the incoming user message with
`deleteMessagesFrom({ fromMessageId: message.id })` followed by
`saveMessages([message])` (`chapters/[chapterId]/chat/route.ts:116-122`,
`syllabus/chat/route.ts:99-106`). `deleteMessagesFrom` is a no-op for an absent
id (`lib/messages/delete.ts:22`) and `saveMessages` upserts by id
(`lib/messages/save.ts:48`). So **re-sending the identical user message is
idempotent whether or not it was persisted before the failure** — the client
never has to know which happened.

## Changes

### 1. Hero keeps its text on failure — `app/[locale]/hero.tsx`

Wrap the prompt in `PromptInputProvider` (already exported from
`@/lib/components/ai-elements/prompt-input`) and rethrow from `handleSubmit`. In
controlled mode `PromptInput` skips the eager `form.reset()` and only calls
`controller.textInput.clear()` when `onSubmit` resolves without throwing
(`prompt-input.tsx:894`, `917-933`).

```tsx
} catch (err) {
  setError(err instanceof Error ? err : new Error(String(err)));
  setSubmitting(false);
  // Rethrow so PromptInput keeps the text for a retry.
  throw err;
}
```

```tsx
<PromptInputProvider>
  <PromptInput onSubmit={handleSubmit}>…</PromptInput>
</PromptInputProvider>
```

Add a short comment above the `throw` explaining the contract, since "throw ⇒
don't clear" is not obvious at the call site.

No other hero change is needed: `router.push` already runs only after the action
resolves, and `PromptInputSubmit`'s empty-text block reads
`controller.textInput.value` in controlled mode (`prompt-input.tsx:1313-1316`),
so the empty-input guard from `800bcfd` still works.

### 2. Retry drives the failed turn — `lib/chat/use-journey-chat.ts`

Export a pure helper next to `prepareChatRequest` (same file, same barrel policy
— it stays an internal export for tests, not re-exported from
`lib/chat/index.ts`):

```ts
/** What a retry after a failed turn should re-drive. */
export type RetryTarget =
  | { kind: 'regenerate'; messageId: string }
  | { kind: 'resend' };

export function selectRetryTarget(messages: UIMessage[]): RetryTarget { … }
```

Rules:

- last message is `assistant` (a partial stream) →
  `{ kind: 'regenerate', messageId: last.id }`
- last message is `user`, or there are no messages → `{ kind: 'resend' }`

Then rewrite `retry` in terms of the existing handlers:

```ts
const retry = (body?: Record<string, unknown>) => {
  const target = selectRetryTarget(messages);
  if (target.kind === 'regenerate') {
    handleRegenerate({ messageId: target.messageId, body });
    return;
  }
  // Re-send the last user message as the delta. The route truncates from its
  // id and upserts, so this is correct whether or not it was persisted.
  triggerResponse(body);
};
```

`triggerResponse` is `sendMessage(undefined, …)`, which pushes nothing new and
makes `prepareChatRequest` ship `messages.at(-1)` as `message`
(`use-journey-chat.ts:169-172`) — exactly the idempotent re-send described
above. With no messages at all it emits a bare start signal, which the chapter
route handles (`route.ts:123-135`).

Also tighten `retry`'s type so a `MouseEvent` can never be passed as `body` (the
immediate cause of the circular-JSON error).

### 3. Stop leaking the click event — `lib/chat/view.tsx`

`onRetry` is typed `() => void` but is handed to `onClick`, so React passes the
event at runtime. Call it explicitly:

```tsx
<Button size="xs" variant="outline" onClick={() => onRetry()}>
```

Do the same audit for `onStop` (harmless today — `stop` ignores its argument —
but worth the same treatment for consistency).

### 4. Show the error row on an empty transcript — `lib/chat/view.tsx`

`<Conversation>` is gated on `messages.length > 0` (`view.tsx:454`), and
`streamError` renders inside it (`view.tsx:462`). When a fresh chapter's
assistant-first `triggerResponse()` fails, the transcript is empty and the user
sees **nothing** — no error, no Retry. Widen the guard so the error row is
reachable:

```tsx
{(messages.length > 0 || streamError !== null) && ( <Conversation …> )}
```

### 5. Chat pages — no change

`useJourneyChat.handleSubmit` is synchronous and never throws, so `PromptInput`
clears the textarea on every send. That is the desired behaviour: the message is
optimistically added to the transcript by `useChat` and survives the failure
(`node_modules/ai/dist/index.mjs` — `pushMessage` runs before `makeRequest` and
is not rolled back), so the text is recoverable from the transcript and Retry
now re-drives it.

### 6. Housekeeping — `BUGS.md`

Remove the **"Hero prompt misbehavior"** entry: the empty-submission half landed
in `800bcfd` and the reset-on-error half is fixed here.

No new i18n strings — `Welcome.createJourneyError`, `JourneyChat.streamError`
and `JourneyChat.retry` all already exist.

## Tests

- `lib/chat/use-journey-chat.test.ts` — add a `describe('selectRetryTarget')`
  block covering: empty list → `resend`; last message `user` → `resend`; last
  message `assistant` → `regenerate` with that id; a `user` message following an
  `assistant` message → `resend`. Plain function assertions, matching the
  existing `prepareChatRequest` suite (no jsdom needed).
- `app/[locale]/hero.test.tsx` — **new**, and the first interactive component
  test in the repo, so it needs a `// @vitest-environment jsdom` pragma
  (`vitest.config.ts` sets `environment: 'node'`; `jsdom`,
  `@testing-library/react` and `@testing-library/user-event` are already
  devDependencies). Mock `./create-draft-journey` and `@/lib/i18n/navigation`,
  wrap in `NextIntlClientProvider` like
  `lib/components/error-detail-popover.test.tsx`. Assert:
  - action rejects → textarea still holds the typed text, error line rendered,
    `router.push` not called;
  - action resolves → `router.push(result.path)` called with the returned path.

## Verification

1. `pnpm test` — new and existing suites pass.
2. `pnpm typecheck && pnpm lint`.
3. `pnpm dev`, then exercise each path manually:
   - **Hero, failure**: block or fail `createDraftJourneyAction` (e.g. sign out
     in another tab so `auth()` returns null, or throw from the action
     temporarily). Submit → error line appears, **text is still in the
     textarea**, URL unchanged. Fix the cause, hit send again → journey is
     created and the page navigates.
   - **Hero, success**: normal submit navigates to the syllabus page and the
     chat starts.
   - **Chapter chat, retry after a failed send**: with the chapter chat open,
     make the route fail (e.g. temporarily
     `return new Response('Bad Request', { status: 400 })` at the top of
     `app/api/journeys/[journeyId]/chapters/[chapterId]/chat/route.ts`). Send a
     message → textarea clears, the message appears in the transcript, the error
     row shows `Bad Request` in the popover. Remove the forced failure, click
     **Retry** → the same user message is re-sent, no circular-JSON error, the
     assistant responds, and the transcript is not duplicated after a refresh
     (confirms the delete-then-upsert path).
   - **Syllabus chat, retry**: same procedure against
     `app/api/journeys/[journeyId]/syllabus/chat/route.ts`. Retry must no longer
     return `400 Bad Request`.
   - **Fresh chapter, failed first turn**: open a newly unlocked chapter with a
     forced route failure — the error row and Retry button must be visible even
     though the transcript is empty.
