# Delta Message Transport — Implementation Plan

## 1. Overview

Once messages are persisted to the database (see the
[Persist Syllabus Draft](./persist-syllabus-draft.md) plan), the server holds the canonical
conversation history. The client sending the full message array on every request becomes
redundant: it wastes bandwidth, and the server has no way to verify that the client-supplied
history has not been tampered with.

This plan describes replacing the full-history transport with a **delta transport**: the client
sends only the new or changed message on each turn, and the server assembles the full context
by reading from the database. Edits and regenerations are explicitly signalled so the server
knows which DB rows to supersede.

**Chapter chat sequencing:** Story 5 (`.claude/plans/03-05-message-persistence.md`) adds
database-backed chapter history while **keeping** the default full `messages: UIMessage[]`
request body. Narrowing chapter chat to the delta wire format and assembling model context
from the DB alone is **not** part of Story 5; for this route, that work is intentionally
deferred to §11 Step 5 below — after persistence is verified in production.

### Scope

The delta transport applies to **both** chat endpoints:

| Endpoint | Covered here |
|----------|-------------|
| `POST /api/syllabus/chat` | Yes — primary focus; persistence in place from the Persist Syllabus Draft plan. |
| `POST /api/journeys/[journeyId]/chapters/[chapterId]/chat` | Yes — described in §8; ships **last** (§11 Step 5) after chapter-chat persistence (Story 5) is live. Story 5 does **not** change this route to the delta body shape. |

### Prerequisite

The `messages` table and entity-layer save/list helpers must exist before this plan is
implemented. The delta transport relies on the database being the source of truth.

- **Syllabus chat:** covered by the [Persist Syllabus Draft](./persist-syllabus-draft.md) plan.
- **Chapter chat:** covered by Story 5 — Chapter Chat Persistence
  (`.claude/plans/03-05-message-persistence.md`), which lands persistence **without** delta
  transport on the chapter route.

---

## 2. The SDK Hook: `prepareSendMessagesRequest`

`DefaultChatTransport` (and its abstract parent `HttpChatTransport`) accepts a
`prepareSendMessagesRequest` callback. When provided, this function **completely replaces** the
default request body for every outgoing chat request. The callback receives:

```ts
type PrepareSendMessagesRequest<UI_MESSAGE extends UIMessage> = (options: {
  id: string;                               // useChat session ID
  messages: UI_MESSAGE[];                   // already-truncated client state
  trigger: 'submit-message' | 'regenerate-message';
  messageId: string | undefined;            // populated for edits and regenerations
  body: Record<string, any> | undefined;    // extra fields from handleSubmit body param
  // + api, credentials, headers, requestMetadata
}) => { body: object; headers?: HeadersInit; credentials?: RequestCredentials; api?: string };
```

**Critical detail**: the SDK mutates `state.messages` *before* calling `makeRequest`, so by
the time `prepareSendMessagesRequest` fires, `messages` is already the post-truncation snapshot.
For an edit, the edited message is already in place at `messages[messages.length - 1]`. For a
regeneration, the regenerated assistant message is already removed.

No subclassing is required. The transport stays `DefaultChatTransport`; only the callback
is added.

---

## 3. Three Operation Types — What the Client Sends

### 3.1 New message

Triggered by `sendMessage({ text })` (no `messageId`).

SDK behaviour: appends the new user message to client state, calls `makeRequest` with
`trigger: 'submit-message'`, `messageId: undefined`.

Request body sent:
```ts
{
  message: messages[messages.length - 1],   // the new user message
  // + journeyId / chapterId, styleId, locale — from the body param
}
```

### 3.2 Edit

Triggered by `sendMessage({ text, messageId })`.

SDK behaviour:
1. Slices `state.messages` to `[0 … editIndex + 1]`.
2. Replaces the message at `editIndex` in client state with the new content, **preserving the
   original message ID**.
3. Calls `makeRequest` with `trigger: 'submit-message'`, `messageId: <edited message id>`.

Because the edited message's ID is preserved, `messages[messages.length - 1].id === messageId`.

Request body sent:
```ts
{
  message: messages[messages.length - 1],   // edited user message, same id as original
  // + scope fields
}
```

The server distinguishes "new" from "edit" by checking whether `message.id` already exists in
the database — no explicit flag is needed in the request body.

### 3.3 Regenerate

Triggered by `regenerate({ messageId })`.

SDK behaviour:
1. Slices `state.messages` to `[0 … assistantIndex]`, *removing* the assistant message from
   client state.
2. Calls `makeRequest` with `trigger: 'regenerate-message'`, `messageId: <assistant message id>`.

No new user message is being submitted; `messages[messages.length - 1]` is the last *user*
message from the previous turn.

Request body sent:
```ts
{
  regenerateFromMessageId: messageId,       // the assistant message to replace
  // + scope fields
}
```

---

## 4. Server-Side Protocol

The server handles each operation type by reading the correct history from the database and
then streaming a response.

### Unified algorithm

```
RECEIVE { message?, regenerateFromMessageId?, journeyId, chapterId?, ... }

if regenerateFromMessageId present:
    deleteMessagesFrom({ journeyId, chapterId, fromMessageId: regenerateFromMessageId })
    history ← getMessages({ journeyId, chapterId })
    // history ends with the last user message from before the regenerated turn
else:
    deleteMessagesFrom({ journeyId, chapterId, fromMessageId: message.id })
    // ↑ no-op when message.id is new; deletes original + tail when message.id already exists
    saveMessages({ journeyId, chapterId, messages: [message] })
    history ← getMessages({ journeyId, chapterId })
    // history now ends with the new / edited user message

convertToModelMessages(history) → modelMessages
streamText({ ..., messages: modelMessages, onFinish: saveAssistantMessages })
```

### Why `deleteMessagesFrom` is safe for new messages

`deleteMessagesFrom` is implemented as:

```sql
DELETE FROM messages
WHERE journey_id = $journeyId
  AND (
    (chapter_id = $chapterId) OR
    ($chapterId IS NULL AND chapter_id IS NULL)
  )
  AND created_at >= (
    SELECT created_at FROM messages WHERE id = $fromMessageId
  );
```

When `fromMessageId` does not exist in the database (new message case), the subquery returns
`NULL`. The comparison `created_at >= NULL` evaluates to `NULL` (falsy in a `WHERE` clause),
so no rows are deleted. The operation is a no-op.

---

## 5. New Entity Function: `deleteMessagesFrom`

Add to `lib/server/messages/`:

**`lib/server/messages/delete.ts`**

```ts
/** Parameters for truncating a conversation from a given message onwards. */
export type DeleteMessagesFromParams = {
  journeyId: string;
  /** null = syllabus chat scope. */
  chapterId: string | null;
  /** ID of the first message to delete (inclusive). All subsequent messages in the scope are
   *  also deleted. If this ID does not exist in the scope, the call is a no-op. */
  fromMessageId: string;
};

/**
 * Deletes a message and all subsequent messages within the same conversation scope.
 * Used to truncate the stored history when the user edits a past message or
 * regenerates an assistant response.
 *
 * Safe to call when `fromMessageId` does not exist — the operation becomes a no-op.
 */
export async function deleteMessagesFrom(
  params: DeleteMessagesFromParams,
): Promise<void>;
```

Update `lib/server/messages/index.ts` to re-export `deleteMessagesFrom` and
`DeleteMessagesFromParams`.

---

## 6. `useJourneyChat` — Add `prepareSendMessagesRequest`

Location: `lib/journey-chat/use-journey-chat.ts`

Add a `prepareSendMessagesRequest` callback to the `DefaultChatTransport` constructor. The
callback lives inside `useJourneyChat` so it has access to the current scope (journeyId,
chapterId) via a parameter or closure.

The `body` object the callback receives at runtime is the extra body merged in by each
`handleSubmit` call — it already contains `journeyId`, `styleId`, `locale`, etc. The callback
uses these to build the final request body.

```ts
transport: new DefaultChatTransport({
  api,
  prepareSendMessagesRequest: ({ messages, trigger, messageId, body }) => {
    if (trigger === 'regenerate-message') {
      return {
        body: { ...body, regenerateFromMessageId: messageId },
      };
    }

    // submit-message — new message or edit (server distinguishes by ID lookup)
    return {
      body: { ...body, message: messages[messages.length - 1] },
    };
  },
}),
```

No other changes to the hook signature or behaviour are needed.

---

## 7. Syllabus Chat API Route (`POST /api/syllabus/chat`)

### Updated `RequestBody` type

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

Exactly one of `message` or `regenerateFromMessageId` must be present; the route validates this
and returns 400 otherwise.

### Validation and authorisation

Same as in the Persist Syllabus Draft plan: check journey ownership and `status === 'drafting'`.

### Assembling model messages

```ts
if (body.regenerateFromMessageId) {
  await deleteMessagesFrom({
    journeyId,
    chapterId: null,
    fromMessageId: body.regenerateFromMessageId,
  });
} else {
  await deleteMessagesFrom({
    journeyId,
    chapterId: null,
    fromMessageId: body.message.id,
  });
  await saveMessages({ journeyId, chapterId: null, messages: [body.message] });
}

const history = await getMessages({ journeyId, chapterId: null });
const modelMessages = await convertToModelMessages(history);
// … apply ephemeral cache annotation to last message …
```

### Saving the response

```ts
const result = streamText({
  // …
  onFinish: async ({ response }) => {
    await saveMessages({
      journeyId,
      chapterId: null,
      messages: response.messages,
    });
  },
});
```

The `updateSyllabusDraft` tool's `execute` continues to call `updateDraftSyllabus` to save the
latest draft to `journeys.syllabus` — no change there.

---

## 8. Chapter Chat API Route (`POST /api/journeys/[journeyId]/chapters/[chapterId]/chat`)

The same delta pattern applies to chapter chat. The changes are structurally identical to §7,
with `chapterId` non-null and the `styleId` field absent (the style is read from the journey
record).

**Prerequisite**: the `messages` table must be populated for chapter sessions (Story 5 —
`.claude/plans/03-05-message-persistence.md`). Story 5 keeps the full `messages` request body;
switching this route to the delta body and DB-assembled model context is **only** in scope
here (§8 + §11 Step 5), after Story 5 is deployed and stable.

The specific concerns unique to chapter chat:

- The **`triggerResponse()` (assistant-first turn)**: `sendMessage(undefined)` sends a
  `submit-message` with no message body and no messageId. The route recognises the absence of
  both `message` and `regenerateFromMessageId` as the "start" signal, reads an empty DB history
  (new chapter, no messages yet), and injects the existing `'Begin.'` cue as the sole model
  message.

- The **synthetic user message** injected by `chapter-page.tsx` via `setMessages` (the
  "I applied the suggested syllabus change." message) must be persisted when syllabus proposals
  are applied so reloads and the eventual delta transport share the same DB truth. Story 5
  addresses this via `applySyllabusChangeAction` saving the synthetic row server-side. When
  chapter delta is enabled later, keep that invariant — the delta body alone does not carry
  client-only injections.

---

## 9. Impact on `activateJourneyAction`

The `ActivateJourneyInput` type in the Persist Syllabus Draft plan currently includes
`messages: UIMessage[]` (passed to `bootstrapJourney` to generate the journey title and learner
memory). Once the delta transport is in place, all messages are in the database — the server
action can retrieve them itself:

```ts
export type ActivateJourneyInput = {
  journeyId: string;
  syllabus: Syllabus;          // final draft, confirmed by the user
  styleId: string;             // final style choice at moment of activation
};
```

Inside `activateJourneyAction`:

```ts
const messages = await getMessages({ journeyId, chapterId: null });
const { title, memory } = await bootstrapJourney({ draft: syllabus, messages, locale });
```

The `SyllabusChat` component no longer needs to pass `messages` to the action — only `journeyId`,
`syllabus`, and `styleId`.

---

## 10. Prerequisites

| Prerequisite | From plan |
|---|---|
| `messages` table exists | Persist Syllabus Draft — §4.3 |
| `saveMessages` function | Persist Syllabus Draft — §5.4 |
| `getMessages` function | Persist Syllabus Draft — §5.4 |
| API routes save incoming messages | Persist Syllabus Draft — §7.1 |
| `journeyId` required in syllabus chat request body | Persist Syllabus Draft — §7.1 |
| Chapter chat rows in `messages` (`phase='chapter'`) | Story 5 — `.claude/plans/03-05-message-persistence.md` (full-body transport; no chapter delta yet) |

---

## 11. Implementation Order

The delta transport should be implemented **after** message persistence is fully deployed and
verified. It is a targeted refinement, not a foundational change. It can be applied to routes
one at a time.

### Step 1 — Entity layer: `deleteMessagesFrom`

Add `lib/server/messages/delete.ts` and update the barrel. Write unit tests.

If Story 5 already landed this helper for chapter-chat tail truncation while the route still
accepts a full `messages` array, treat this step as **reuse + test coverage** for the
syllabus-scoped call sites (and any gaps Story 5 did not cover), not necessarily a greenfield
file add.

### Step 2 — Update `useJourneyChat`

Add `prepareSendMessagesRequest` to `DefaultChatTransport` for whichever routes have moved to
the delta body (syllabus first in Steps 3–4; chapter in Step 5). Until Step 5, the chapter chat
`api` URL must keep using the default full-body transport so Story 5 remains shippable on its
own.

This is backward-compatible at the transport level but changes the request body schema, so the
API route must be updated in the same deployment.

### Step 3 — Update the syllabus chat API route

Change `RequestBody` from `messages: UIMessage[]` to `message?: UIMessage` +
`regenerateFromMessageId?: string`. Implement the unified server algorithm from §4.

### Step 4 — Update `activateJourneyAction`

Remove `messages` from `ActivateJourneyInput`; read from DB inside the action. Update the
`SyllabusChat` and `JourneySyllabusChat` callers.

### Step 5 — Chapter chat (last): delta wire + DB-assembled context

This is the **final** chapter-chat milestone for delta transport: Story 5 has already shipped
persistence with the stock full `messages` array. Repeat the route + transport work from Steps
2–3 for the chapter chat URL only: `prepareSendMessagesRequest`, `message` /
`regenerateFromMessageId` body, and model context assembled from the database per §8 (including
the `triggerResponse` empty-delta start signal). Re-verify the synthetic applied-proposal message
path (Story 5 should already persist it server-side). Address any remaining edge cases before
deploying chapter delta to production.

---

## 12. Testing

### Entity layer

| File | Tests |
|------|-------|
| `lib/server/messages/delete.test.ts` | `deleteMessagesFrom` deletes target + all after; is a no-op when `fromMessageId` not found; respects `chapterId` scope isolation. |

### API route

| File | Tests |
|------|-------|
| `app/api/syllabus/chat/route.test.ts` | Returns 400 when both `message` and `regenerateFromMessageId` are absent; returns 400 when both are present; new message: calls `saveMessages` then streams; edit: calls `deleteMessagesFrom` then `saveMessages` then streams; regenerate: calls `deleteMessagesFrom` (no save) then streams; response messages saved in `onFinish`. |

### `useJourneyChat`

The `prepareSendMessagesRequest` callback is pure logic; it can be extracted and unit-tested
independently of the React hook.

| File | Tests |
|------|-------|
| `lib/journey-chat/prepare-request.test.ts` | (extracted helper) `submit-message` without `messageId` returns `{ message: lastMessage }`; `submit-message` with `messageId` returns `{ message: editedMessage }`; `regenerate-message` returns `{ regenerateFromMessageId }`. |
