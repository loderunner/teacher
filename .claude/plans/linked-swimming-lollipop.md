# Plan: Rewrite no-op tools for persistence

## Context

Two of the four AI tools (`markChapterComplete`, `updateSyllabusDraft`) have
empty `execute` functions — a workaround from when messages weren't persisted.
Side effects had to be deferred to separate server actions triggered by client
button clicks. Now that every message (including tool call inputs and results)
is stored in the DB, these tools can do their real work in `execute` directly.

`proposeSyllabusChange` is intentionally an elicitation tool (it proposes; the
user decides to apply) and stays out of scope.

Changes:

- Eliminates `completeChapterAction` server action and its "Complete Chapter"
  button
- Makes `markChapterComplete` return a meaningful `{ nextChapterPath }` result
- Makes `updateSyllabusDraft` write the draft to DB so activation reads from DB
- Eliminates client-passed `syllabus` in `activateJourneyAction`

---

## Tool 1 — `markChapterComplete`: execute runs chapter completion

### `lib/chapter-chat/tools.ts`

Add params to `createMarkChapterCompleteTool`:

```ts
{
  (userId, journey, chapter, messages, style, locale);
}
```

Execute:

1. `generateChapterSummary({ style, locale, chapter, messages })` — `messages`
   are the request-side messages (pre-stream). The AI's final response isn't
   saved yet, but the substantive teaching content is present.
2. `completeChapter({ userId, journeyId: journey.id, idx: chapter.idx, summary })`
3. Find next chapter from `journey.chapters` (already loaded in the route).
4. Return `{ nextChapterPath: string | null }`.

### `app/api/journeys/[journeyId]/chapters/[chapterId]/chat/route.ts`

Pass all factory params:

```ts
createMarkChapterCompleteTool({
  userId,
  journey,
  chapter,
  messages,
  style,
  locale,
});
```

`messages` is already in scope (validated request messages).

### `app/[locale]/journeys/[journeySlug]/[chapterSlug]/chapter-page.tsx`

- Remove: `completeChapterAction` import, `completing` transition,
  `completeError` state, `handleComplete`, and the footer button block.
- Add: `useEffect` that fires when `status === 'ready'` and a
  `tool-markChapterComplete` part with output exists → read `nextChapterPath`
  from `part.output` → `router.push(nextChapterPath)` or `router.refresh()` when
  null.

### Delete

`app/[locale]/journeys/[journeySlug]/[chapterSlug]/complete-chapter.ts`

---

## Tool 2 — `updateSyllabusDraft`: execute persists draft to DB

### New: `lib/server/journeys/updateSyllabus.ts`

```ts
export async function updateJourneySyllabus({ userId, journeyId, syllabus }) {
  await db
    .update(journeys)
    .set({ syllabus })
    .where(and(eq(journeys.id, journeyId), eq(journeys.userId, userId)));
}
```

No migration needed — `journeys.syllabus` already exists (set by
`applySyllabusChange` for active journeys; now also written during drafting).

### `lib/syllabus-chat/tool.ts`

Convert singleton to factory:

```ts
export function createUpdateSyllabusDraftTool({ userId, journeyId }) { ... }
```

Execute: calls `updateJourneySyllabus({ userId, journeyId, syllabus })`, returns
`{ ok: true }`.

Update barrel `lib/syllabus-chat/index.ts` to export
`createUpdateSyllabusDraftTool` instead of `updateSyllabusDraftTool`.

### `app/api/journeys/[journeyId]/syllabus/chat/route.ts`

Instantiate: `createUpdateSyllabusDraftTool({ userId, journeyId })`.

### `app/[locale]/journeys/[journeySlug]/syllabus/activate-journey.ts`

- Remove `syllabus` from `ActivateJourneyInput`.
- After loading `existing`, validate:
  `const syllabus = syllabusSchema.parse(existing.syllabus)`. This reads the
  draft written by execute — no client-supplied syllabus.

### `app/[locale]/journeys/[journeySlug]/syllabus/syllabus-chat.tsx`

- Remove `syllabus` from the `activateJourneyAction` call.
- Keep `deriveSyllabusDraftsFromMessages` — `partialDraft` still drives the
  streaming sidebar preview. `draft` continues to gate the "Start journey"
  button (messages are persisted so this is reliable across page loads).

---

## Tests

- `lib/chapter-chat/tools.test.ts` — add/update unit tests for the
  `markChapterComplete` execute. Mock `generateChapterSummary` and
  `completeChapter`. Verify correct args and return shape.
- `lib/syllabus-chat/tool.test.ts` — unit test for
  `createUpdateSyllabusDraftTool` execute. Mock `updateJourneySyllabus`. Verify
  it is called with the validated syllabus.
- Delete any test files that exclusively tested the now-deleted
  `completeChapterAction`.

---

## File review order (for PR)

1. `lib/chapter-chat/tools.ts`
2. `lib/syllabus-chat/tool.ts` + `lib/syllabus-chat/index.ts`
3. `lib/server/journeys/updateSyllabus.ts` (new)
4. `app/api/journeys/[journeyId]/chapters/[chapterId]/chat/route.ts`
5. `app/api/journeys/[journeyId]/syllabus/chat/route.ts`
6. `app/[locale]/journeys/[journeySlug]/[chapterSlug]/chapter-page.tsx`
7. `app/[locale]/journeys/[journeySlug]/syllabus/activate-journey.ts`
8. `app/[locale]/journeys/[journeySlug]/syllabus/syllabus-chat.tsx`

---

## Verification

1. `pnpm lint && pnpm build` — no type or lint errors.
2. Chapter chat: chat until the AI signals completion → chapter marked `done` in
   DB immediately, app navigates to the next chapter automatically (no button
   click needed).
3. Syllabus chat: each AI turn that updates the outline writes the draft to
   `journeys.syllabus`. "Start journey" still appears; clicking activates the
   journey without re-sending the syllabus from the client.
