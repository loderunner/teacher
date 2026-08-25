# Roll back chat messages that never reached the server

## Context

`6d51bbb` made **Retry** re-drive the right turn, but it deliberately treated
both failure modes the same (see
`.claude/plans/error-handling-on-sending-twinkly-token.md` §5, "Chat pages — no
change"). That leaves the optimistic user message on screen even when it was
never persisted: the transcript shows a message the server has no record of, and
the only way forward is a Retry button that duplicates an affordance the message
toolbar already provides.

The two failures are genuinely different:

1. **Send failed** — the POST never reached the streaming stage (network error,
   `401`/`400`/`404`/`409` from the route). No assistant `start` chunk arrived,
   so the optimistic message is a lie: remove it and hand the text back.
2. **Stream failed** — the response started and died part-way. The user message
   is persisted, and so is the partial assistant message: the server's
   `onFinish` runs on stream flush (`handleUIMessageStreamFinish`, `ai` dist
   `5886-5940`), which happens even when the model errors mid-stream. The
   transcript matches the database, so both "keep chatting" and "regenerate" are
   correct continuations — and **Regenerate is already on the assistant
   message's toolbar** (`view.tsx:415-423`, rendered as soon as streaming
   stops).

Intended outcome:

- **Scenario 1**: optimistic message removed, prompt refilled with the user's
  text, error row with details in the popover.
- **Scenario 2**: transcript untouched, error row with details; the user either
  types a follow-up (the truncated turn is in the model's context) or hits
  Regenerate on the partial message.

### Decisions taken

- **The Retry button goes away**, and with it `retry`, `RetryTarget` and
  `selectRetryTarget` — the whole mechanism existed to pick between "resend" and
  "regenerate", and neither branch is reachable any more. Scenario 1 retries by
  pressing send on the refilled prompt; scenario 2 retries via the message
  toolbar's Regenerate. See "Accepted gaps" for the one case this leaves bare.
- **Persistence is inferred from the `start` chunk.** The AI SDK appends the
  assistant message to `messages` on the first `write()`, which the `start`
  chunk triggers — so "an assistant message was appended" ⇔ "the route reached
  `streamText`" ⇔ "the user message was persisted"
  (`app/api/journeys/[journeyId]/chapters/[chapterId]/chat/route.ts:116-122`).
  There is a small window between `saveMessages` and the first chunk where this
  is wrong; accepted.
- **No message-id plumbing.** Because the check is "was an assistant message
  appended", the optimistic message is identified positionally
  (`messages.slice(0, -1)`), so `handleSubmit` keeps calling
  `sendMessage({ text })` and never mints an id. Nothing is re-sent under a
  reused id.
- **Routes unchanged.** Mid-stream errors keep surfacing as the AI SDK's default
  `"An error occurred."` in the popover; forwarding the real provider message
  was considered and rejected.
- **Error text stays generic.** `JourneyChat.streamError` covers both cases — no
  new strings, and `JourneyChatView` keeps its `error?: Error` prop.
- **`PromptInputProvider` is used as-is**, no change to the vendored component.
  It already _is_ the controlled mode (`usingProvider`, `prompt-input.tsx:884`):
  it lifts the text into React state and drops the eager `form.reset()`. The
  only requirement is that whatever restores the text be a **descendant** of the
  provider, which is why the prompt row becomes its own small component.
- **The restored draft is the only new state.** After the rollback the trailing
  message is the previous turn's assistant message, indistinguishable from a
  partial one, so the send/stream distinction cannot be re-derived at render
  time — but it does not need its own flag either: `draft !== null` is the
  refill signal and nothing else consumes it.

### Accepted gaps

- **Lost response after a persisted send** (connection drops between
  `saveMessages` and the first chunk): the row stays in the database while the
  client drops it. Reloading surfaces it, and re-sending the restored text
  stores a second, near-identical message. Rare, visible, and recoverable by
  hand.
- **A first turn that fails with an empty transcript** — a fresh chapter's
  assistant-first `triggerResponse()` on mount — leaves the error row with no
  button to press, since there is neither a message to roll back nor an
  assistant message to regenerate. Recovery is to type something (which sends
  normally) or reload the page, which re-fires the mount trigger. This is the
  one case the Retry button covered and this plan gives up; the widened
  `Conversation` guard from `6d51bbb` (`view.tsx:454`) stays so at least the
  error is visible.

## Changes

### 1. Classify the failure and roll back — `lib/chat/use-journey-chat.ts`

New state:

```ts
/** Text handed back to the prompt after a send that never reached the server. */
const [draft, setDraft] = useState<string | null>(null);
// Text of the message currently in flight from handleSubmit, if any.
const pendingTextRef = useRef<string | null>(null);
```

`handleSubmit` records the text and retires any previous failure; the other
three triggers (`handleRegenerate`, `handleEditMessage`, `triggerResponse`) just
call `setDraft(null)`:

```ts
const handleSubmit = ({ text, body }: HandleSubmitParams) => {
  pendingTextRef.current = text;
  setDraft(null);
  void sendMessage({ text }, { body: { locale, ...body } });
};
```

Clearing to `null` also matters for the refill effect downstream: it makes a
second failure with the same text a real state change.

Add `onFinish` to the `useChat` options. It runs in the SDK's `finally`, after
`setStatus('error')`, and receives the authoritative post-failure message list —
no React-render staleness, unlike reading `messages` inside `onError`. (No stale
closure either: `@ai-sdk/react` refreshes `onFinish` through a ref on every
render, dist `143-178`.)

```ts
onFinish: ({ messages: after, isError }) => {
  const text = pendingTextRef.current;
  pendingTextRef.current = null;
  if (!isError || text === null || streamStarted(after)) {
    return;
  }
  // No `start` chunk, so the route never got as far as persisting the message.
  setMessages((prev) => prev.slice(0, -1));
  setDraft(text);
},
```

with the check extracted as a pure helper where `selectRetryTarget` used to be —
internal export, not added to the barrel, same policy as `prepareChatRequest`:

```ts
/**
 * Whether the assistant's `start` chunk arrived before the turn failed. The SDK
 * appends the assistant message on the first chunk, and the routes persist the
 * user message just before they start streaming, so a trailing user message
 * means nothing was written.
 *
 * @param messages - Message list as it stands after the failed turn.
 */
export function streamStarted(messages: UIMessage[]): boolean {
  return messages.at(-1)?.role === 'assistant';
}
```

Delete `retry`, `RetryTarget` and `selectRetryTarget`. Return `draft` alongside
the existing values.

### 2. Restore the draft from inside the provider — `lib/chat/view.tsx`

Swap the `onRetry?: () => void` prop for:

```ts
/** Text to put back into the prompt after a failed send; null when there is none. */
draft?: string | null;
```

Extract the prompt row into a small component so it can consume the controller,
and wrap it in `PromptInputProvider` (replacing the bare `PromptInput` at
`view.tsx:467-475`):

```tsx
const ChatPrompt = ({
  draft,
  placeholder,
  status,
  streaming,
  onStop,
  onSubmit,
}: ChatPromptProps) => {
  const { setInput } = usePromptInputController().textInput;

  // A send that never reached the server hands its text back for another try.
  useEffect(() => {
    if (draft !== null) {
      setInput(draft);
    }
  }, [draft, setInput]);

  return (
    <PromptInput onSubmit={onSubmit}>
      <PromptInputTextarea disabled={streaming} placeholder={placeholder} />
      <PromptInputFooter>
        <div />
        <PromptInputSubmit status={status} onStop={() => onStop?.()} />
      </PromptInputFooter>
    </PromptInput>
  );
};
```

`setInput` is the provider's raw `useState` setter (`prompt-input.tsx:378`), so
it is a stable dependency and the effect needs no lint suppression. In provider
mode `PromptInput` still clears on a successful sync `onSubmit`
(`prompt-input.tsx:927-933`), and `PromptInputSubmit`'s empty-input block reads
`controller.textInput.value` (`prompt-input.tsx:1313-1316`), so the guard from
`800bcfd` keeps working.

`onStop={() => onStop?.()}` rather than `onStop={onStop}`: the view currently
hands React's event straight to these callbacks — harmless for `stop`, but it is
the shape that produced the circular-JSON bug in the previous plan, and
`b48cda2` reverted the fix.

The error row (`view.tsx:439-450`) loses its button and keeps everything else:

```tsx
const streamError =
  status === 'error' && !readOnly ? (
    <div className="flex items-center gap-2 py-1 text-sm">
      <p className="text-destructive">{t('streamError')}</p>
      <ErrorDetailPopover detail={error?.message} />
    </div>
  ) : null;
```

### 3. Call sites and strings

- `app/[locale]/journeys/[journeySlug]/[chapterSlug]/chapter-page.tsx:156-169`
  and `app/[locale]/journeys/[journeySlug]/syllabus/syllabus-chat.tsx:150-163`:
  drop `retry` from the destructuring and `onRetry={() => retry()}` from the
  JSX; add `draft={draft}`. `journey-chat-view-island.tsx` is `readOnly` and
  renders no prompt — no change.
- `lib/i18n/messages/en.json` / `fr.json`: remove the now-unused
  `JourneyChat.retry` (`lib/i18n/messages/parity.test.ts` keeps the two files in
  step).

## Tests

`lib/chat/use-journey-chat.test.ts` — replace `describe('selectRetryTarget')`
with `describe('streamStarted')`, alongside the existing `prepareChatRequest`
suite (pure functions, node environment, no jsdom):

- empty message list → `false`
- trailing user message → `false`
- trailing assistant message → `true`
- assistant message with no parts (start chunk only) → `true`

The rollback wiring (`onFinish` → `setMessages`/`setDraft` → refill effect) is
verified manually below; a `renderHook` test would need a second jsdom test file
for the module plus a full `@ai-sdk/react` mock, for little added confidence.

## Verification

1. `pnpm test`, then `pnpm typecheck && pnpm lint`.
2. `pnpm dev`, and exercise both scenarios against the chapter chat
   (`app/api/journeys/[journeyId]/chapters/[chapterId]/chat/route.ts`), then the
   syllabus chat (`…/syllabus/chat/route.ts`):
   - **Scenario 1** — temporarily
     `return new Response('Bad Request', { status: 400 })` at the top of the
     route. Type a message, send. Expect: the message does not stay in the
     transcript, the textarea is refilled with exactly what was typed, and the
     error row shows `Bad Request` in the popover. Remove the forced failure,
     press send → it goes through. Refresh: exactly one copy.
   - **Scenario 1, edited retry** — same forced failure, but edit the restored
     text before re-sending; the edited message is the one that persists.
   - **Scenario 1, twice in a row** — send the same text, let it fail, press
     send again unchanged, let it fail again. The refill must happen both times
     (this is what `setDraft(null)` on submit buys).
   - **Scenario 2** — no route failure; kill the network in devtools
     mid-response. Expect: the partial assistant message stays, the error row
     appears with no button, and the message's toolbar offers **Regenerate** →
     clicking it replaces the partial message with a fresh response. Repeat, and
     this time type a follow-up instead: it sends normally and the model answers
     with the truncated turn in context.
   - **Scenario 2, empty partial** — fail the stream immediately after `start`
     (e.g. throw from the first `experimental_transform` chunk). An empty
     assistant bubble appears with a working Regenerate action.
   - **Fresh chapter, failed first turn** — open a newly unlocked chapter with
     the route forced to 400. Confirm the accepted gap: error row visible on an
     empty transcript, no button; typing a message works, and reloading re-fires
     the mount trigger.
   - **Sanity** — the send button is still blocked on an empty textarea, becomes
     enabled with the restored text, Enter still submits, and the hero (`/`)
     still keeps its text on failure.
