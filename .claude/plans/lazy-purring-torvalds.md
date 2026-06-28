# Plan: Make the `chapters` table the single source of truth

## Context

A learner asked the AI to change the syllabus mid-journey. The change overwrote
the **active** chapter, stripping its overview and sections and leaving only the
title. Root cause: a journey's chapter content is **duplicated** — once in the
`journeys.syllabus` JSONB blob, once in `chapters` rows — and the two drift.
`applySyllabusChange` rewrites the whole JSONB from a model-reconstructed
proposal, so an imperfect reconstruction silently destroys real data.

The fix (Approach 3): after a journey is activated, the **`chapters` table is the
sole source of truth**. The JSONB column is renamed `syllabus_draft` and is used
**only during drafting** plus one read-only post-activation display. This makes
the drift class of bug structurally impossible for the active/done chapters,
while still letting the backend reject content changes to protected chapters.

No backwards compatibility is required — the DB will be reset, so the migration
is a clean schema change with no backfill.

## Decisions (confirmed)

- **Field rename `summary` → `overview` end-to-end** in the syllabus Zod schema,
  type, JSON, DB column, prompts, and UI. This is the *forward-looking* chapter
  overview. The pre-existing `chapters.summary` (the *retrospective* note written
  on completion in `lib/chapters/complete.ts`) is unrelated and stays as-is.
- **`syllabus_draft` is frozen, not nulled, at activation.** It is read in
  exactly one place post-activation: the syllabus chat page, to display "the
  resulting syllabus" the drafting conversation produced. It is **never** read
  for the sidebar, the teaching prompt, or active-chapter logic — those derive
  from `chapters` rows (current state).

## Data model

`chapters` table gains two columns carrying the forward content:

```ts
overview: text('overview').notNull().default(''),          // was syllabus.summary
sections: jsonb('sections').$type<string[]>().notNull().default([]),
// summary: text('summary')  — UNCHANGED: completion note, nullable
```

`journeys.syllabus` JSONB → renamed `syllabus_draft` (still `Syllabus | null`).

The seam where syllabus content maps onto rows is exactly two functions:
`activateJourney` (draft → rows) and `applySyllabusChange` (proposal → rows).
Nowhere else writes chapter content.

## Changes by area

### 1. Schema + migration

- `lib/db/schema.ts`: rename `syllabus` column → `syllabus_draft`; add
  `chapters.overview` and `chapters.sections` as above.
- Run `pnpm drizzle-kit generate` to emit the migration (never hand-edit
  `_journal.json`/snapshots, per project convention). DB will be reset.

### 2. Syllabus schema rename — `lib/syllabus/schema.ts`

- Rename `chapterSchema.summary` → `overview`; update its `.describe()` text.
  `Chapter`/`Syllabus` types flow from `z.infer`, so consumers update by name.

### 3. Entity layer

- `lib/journeys/get.ts`:
  - `Journey.syllabus` → `Journey.syllabusDraft` (read from `syllabus_draft`).
  - `JourneyChapter` gains `overview: string` and `sections: string[]`; select
    those columns. Active-journey chapter content now comes entirely from rows.
  - Keep `safeParse` on `syllabusDraft` for the post-activation display.
- `lib/journeys/activate.ts`: insert chapter rows with `overview: c.overview`,
  `sections: c.sections`; keep writing `syllabus_draft` (frozen snapshot).
- `lib/journeys/updateSyllabusDraft.ts`: write the `syllabus_draft` column
  (drafting-only guard unchanged).
- `lib/journeys/list.ts`: `chapterCount` must reflect the source of truth — for
  `active` journeys count `chapters` rows (correlated subquery); for `drafting`
  fall back to `jsonb_array_length(syllabus_draft->'chapters')`.

### 4. `lib/chapters/applySyllabusChange.ts` — the core fix

- Phase 2: also select `chapters.overview` and `chapters.sections`.
- Phase 4 `Plan`: carry `newOverview` and `newSections` on both `preserve` and
  `insert`.
- **New validation phase (protect active/done content — the bug):**
  - `done` chapter: reject if `title`, `overview`, or `sections` differ from the
    row. Done chapters are fully immutable.
  - `active` chapter: reject if `overview` or `sections` differ (title rename
    still allowed, matching current behavior).
  - Error messages mirror existing style, e.g.
    `Proposal modifies done chapter "<title>"` /
    `Proposal modifies the active chapter's overview or sections`.
  - Compare `sections` by value (length + element-wise equality).
- Apply phase: for `locked` preserved rows write `idx`, `title`, `overview`,
  `sections`; for `done`/`active` write only `idx` (content already verified
  unchanged). Inserts get `overview`/`sections` from the proposal.
- Phase 10: **stop writing the syllabus blob.** Only update
  `currentChapterIndex`. `syllabus_draft` stays the frozen drafting artifact.

### 5. UI — sidebar reads current state from rows

- `lib/components/journey/syllabus-panel-data.ts`:
  - `buildActivatedChapters`: read `overview`/`sections` from `journey.chapters`
    rows, not the JSONB. This is what fixes the user-visible drift.
  - `buildDraftChapters`: `c.summary` → `c.overview`.
  - `DisplayChapter.summary` → `overview`.
- `lib/components/journey/syllabus-panel.tsx`: render `chapter.overview`.

### 6. UI — syllabus chat page shows the resulting (frozen) syllabus

- `app/[locale]/journeys/[journeySlug]/syllabus/syllabus-view.tsx`
  (post-activation, read-only): add a read-only render of the **resulting
  syllabus** in `ChatPageShell.Content`, sourced from `journey.syllabusDraft`
  (reuse the chapter-row markup / `buildDraftChapters`). The sidebar stays
  `SyllabusPanel mode="activated"` — now backed by `chapters` rows = current
  state. This realizes "resulting syllabus in the page, current state in the
  sidebar."
- `app/[locale]/journeys/[journeySlug]/syllabus/syllabus-chat.tsx` (drafting):
  `journey.syllabus` → `journey.syllabusDraft` (the `draft`, `startable`, and
  `handleStartJourney` references).

### 7. Prompts & tools

- `app/api/journeys/[journeyId]/chapters/[chapterId]/chat/prompts.ts`: source the
  current chapter's overview/sections from the `chapter` row
  (`chapter.overview`, `chapter.sections`); remove the
  `journey.syllabus === null` throw. Update the prose that says "title, summary,
  and sections" → "overview".
- `app/api/journeys/[journeyId]/syllabus/chat/tool.ts`: update the
  `updateSyllabusDraft` description line that mentions "summary" → "overview".
- `proposeSyllabusChange` (`.../chapters/[chapterId]/chat/tools.ts`) uses
  `syllabusSchema`, so it picks up `overview` automatically; no text change
  needed (its description doesn't name the field).

### 8. Server actions (light touch)

- `activate-journey.ts` and `apply-syllabus-change.ts` keep validating with
  `syllabusSchema` (now `overview`); no logic change beyond the renamed field
  flowing through.

## Tests

Update colocated tests and add coverage (per "write unit tests with new code"):

- `lib/chapters/applySyllabusChange.test.ts` — add `overview`/`sections` to mock
  rows and proposals; **change** the existing "renaming done chapters" test (a
  done-title change now *rejects*); add cases: done title/overview/sections
  change → throws; active overview/sections change → throws; active title rename
  + unchanged content → resolves; happy path still applies locked overview/
  sections.
- `lib/journeys/get.test.ts`, `lib/journeys/activate.test.ts`,
  `lib/journeys/list.test.ts`, `lib/journeys/updateSyllabusDraft.test.ts` —
  update for `syllabusDraft` + new columns / count logic.
- `lib/syllabus/schema.test.ts` — `summary` → `overview`.
- `lib/components/journey/syllabus-panel.test.tsx` — overview from rows.
- `app/api/journeys/[journeyId]/syllabus/chat/{tool,prompts}.test.ts`,
  `.../chapters/[chapterId]/chat/route.test.ts`,
  `activate-journey.test.ts`, `bootstrap.test.ts` — field rename fallout.

## Verification

```bash
pnpm drizzle-kit generate          # emit migration
pnpm vitest run                     # full suite
pnpm lint
```

End-to-end (reset DB, `pnpm dev`):
1. Draft a journey, watch the sidebar build live, click **Start journey**.
2. On an active chapter, ask the AI for a change that *renames a locked chapter
   and adds a chapter after the active one* → Apply → sidebar reflects new state.
3. Ask for a change that *alters the active chapter's overview/sections* → server
   rejects; active chapter content intact in the sidebar.
4. Revisit the syllabus chat page → it shows the resulting syllabus in the
   content area; the sidebar shows current (possibly changed) chapter state.

## Suggested review order (≥4 files)

1. `lib/db/schema.ts` — the new shape everything else follows.
2. `lib/syllabus/schema.ts` — `summary` → `overview`.
3. `lib/journeys/get.ts` — `Journey`/`JourneyChapter` types, the contract for UI
   and prompts.
4. `lib/chapters/applySyllabusChange.ts` — the core fix and new validation.
5. `lib/journeys/activate.ts`, `lib/journeys/list.ts`, `updateSyllabusDraft.ts`.
6. `lib/components/journey/syllabus-panel-data.ts` + `syllabus-panel.tsx`.
7. `syllabus-view.tsx` + `syllabus-chat.tsx` (the page display split).
8. `prompts.ts` + `tool.ts` (AI text/source changes).
9. Tests.
```
