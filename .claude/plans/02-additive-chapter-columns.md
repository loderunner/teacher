# Plan: Additive `chapters` columns (dual-write)

## Context

This is milestone 2 of 3 in the chapters-source-of-truth refactor described in
the parent plan, `chapters-source-of-truth-overview.md`. That plan's root cause:
a journey's chapter content is duplicated between the `journeys.syllabus` JSONB
blob and `chapters` rows, and `applySyllabusChange` rewrites the whole blob from
a model-reconstructed proposal, silently destroying real data when the
reconstruction is imperfect. The real fix — making `chapters` rows the sole
source of truth, with validation that rejects proposals touching active/done
chapter content — is milestone 3 ("core cutover"), because it changes read paths
and adds a rejection phase that needs careful review and a DB reset.

This milestone does none of that. It only lays the data-model groundwork: two
new, additive `chapters` columns (`overview`, `sections`) that mirror what the
JSONB blob already carries for each chapter, and two write paths
(`activateJourney`, `applySyllabusChange`) updated to populate them alongside
their existing writes. Nothing reads the new columns yet, nothing is renamed,
and no validation behavior changes. The goal is to ship a boring, zero-risk
migration now so that milestone 3 can be a pure read/validation/rename change
reviewed in isolation — not entangled with schema churn.

Splitting this out matters because milestone 3 is the risky part (it changes
what the app reads, adds a rejection path that can throw on previously-valid
proposals, and requires a DB reset). Shipping the additive columns separately,
first, means that risk is isolated to a single, smaller, later PR.

## Decisions

- **No field rename in this milestone.** `lib/syllabus/schema.ts`'s
  `chapterSchema` keeps its existing `summary` field name (the forward-looking
  per-chapter summary the AI drafts). The `summary` → `overview` rename (parent
  plan, Decision 1) is bundled into milestone 3's "atomic rename" alongside the
  `journeys.syllabus` → `syllabus_draft` column rename — doing both renames
  together, in one deploy, keeps the naming story consistent end-to-end instead
  of splitting one conceptual rename across two merges.
- **`journeys.syllabus` is untouched — name and behavior.** Still read and
  written exactly as today (`lib/journeys/get.ts`, `lib/journeys/list.ts`,
  `lib/journeys/updateSyllabusDraft.ts`, and Phase 10 of
  `applySyllabusChange.ts` are not touched by this milestone).
- **Dual-write, not backfill.** The new columns get a `DEFAULT` so the migration
  is non-locking. Only chapter rows created _after_ this deploys (via
  `activateJourney` or `applySyllabusChange`) get real `overview`/`sections`
  values; earlier rows keep the defaults. No backfill script is written — see
  "Deploy rules" for why that's fine in practice.
- **Source field mapping.** Since the syllabus schema's forward-looking field is
  still named `summary` in this milestone, the new `chapters.overview` column is
  populated from `chapter.summary` (the proposal/draft chapter), and
  `chapters.sections` from `chapter.sections`. The column is already named
  `overview` (matching its milestone-3 destiny) even though its current source
  field is `summary` — this avoids a second migration to rename the column
  later.

## Data model

`chapters` table gains two additive columns:

```ts
overview: text('overview').notNull().default(''),
sections: jsonb('sections').$type<string[]>().notNull().default([]),
// summary: text('summary')  — UNCHANGED: retrospective completion note, nullable
```

`journeys.syllabus` — **UNCHANGED** in this milestone. Same column name
(`syllabus`), same type (`Syllabus | null`), same read/write behavior
everywhere. The rename to `syllabus_draft` is milestone 3 only.

No other schema changes. `chapters.summary` (the retrospective note written by
`lib/chapters/complete.ts`) is unrelated and untouched.

## Changes by area

### 1. `lib/db/schema.ts`

Add the two columns to the `chapters` table definition:

```ts
overview: text('overview').notNull().default(''),
sections: jsonb('sections').$type<string[]>().notNull().default([]),
```

Do **not** touch the `journeys.syllabus` column definition in this milestone.

Run `pnpm drizzle-kit generate` to emit the migration (never hand-edit
`_journal.json` or snapshots, per project convention). The emitted migration
should be two `ALTER TABLE chapters ADD COLUMN ... DEFAULT ...` statements —
nothing else.

### 2. `lib/journeys/activate.ts`

In the `tx.insert(chapters).values(...)` call inside `activateJourney`, add
`overview` and `sections` to each inserted row, sourced from the syllabus
chapter being activated:

```ts
await tx.insert(chapters).values(
  syllabus.chapters.map((c, i) => ({
    journeyId: row.id,
    idx: i,
    title: c.title,
    status: i === 0 ? ('active' as const) : ('locked' as const),
    overview: c.summary,
    sections: c.sections,
  })),
);
```

Nothing else in this file changes — the `syllabus` column write (`syllabus`, not
`syllabusDraft`) stays exactly as it is today.

### 3. `lib/chapters/applySyllabusChange.ts` — dual-write only

This is the file that requires the most care to keep reduced. From the full
end-state diff, take **only**:

- **Phase 2** (select existing chapter rows): add `overview: chapters.overview`
  and `sections: chapters.sections` to the selected columns, so the current DB
  values are available for the write-back below.
- **Phase 4** (`Plan` type and its construction): both the `preserve` and
  `insert` variants of `Plan` gain `newOverview: string` and
  `newSections: string[]`, populated from `c.summary` and `c.sections` on the
  incoming proposal chapter — mirroring the same source mapping used in
  `activate.ts`.
- **Phase 8/9 (apply)**: preserved rows write
  `overview: p.newOverview, sections: p.newSections` alongside `idx`/`title`
  exactly as `title` is written today — i.e. do **not** introduce the
  done/active distinction in what gets written; every preserved row's update
  continues to set the same fields it sets today (`idx`, `title`), plus now also
  `overview` and `sections`, unconditionally. Inserted rows also get
  `overview`/`sections` from the plan.

Explicitly **excluded** from this milestone (these are milestone 3 only):

- The new **Phase 6.5 validation block** that rejects proposals modifying a
  `done` chapter's content or an `active` chapter's `overview`/`sections` (the
  `sameSections` helper and the `if (row.status === 'done' | 'active')` checks).
  This milestone writes the new columns but never reads them back for validation
  — no proposal that succeeds today can start failing because of this change.
- The **status-conditional apply logic** in Phase 8 that writes only `idx` for
  `done` rows and `idx`/`title` (no content) for `active` rows. In this
  milestone every preserved row keeps writing `idx`, `title`, `overview`,
  `sections` the same way, regardless of status — matching today's behavior
  where `title` is already written unconditionally for non-done rows. (Today's
  code already special-cases `done` to skip `title`; that special case is
  untouched — only `overview`/`sections` are added to the non-done branch and to
  the `done` branch alike is a choice to make explicitly, see below.)
- **Phase 10's blob write removal.** `journeys.syllabus` keeps being overwritten
  with `newSyllabus` exactly as it is today:
  ```ts
  await tx
    .update(journeys)
    .set({ syllabus: newSyllabus, currentChapterIndex: activePlan.newIdx })
    .where(...)
  ```
  This milestone adds writes to the new columns; it does not remove or alter any
  existing write.

Because today's code already treats `done` chapters specially (only `idx` is
written, to preserve the "done chapters keep their original title" rule), the
dual-write must decide how `overview`/`sections` fit into that existing split.
To keep this milestone's behavior change to zero beyond "two new columns get
populated," extend the existing split symmetrically: wherever `title` is written
today, also write `overview`/`sections`; wherever `title` is withheld today (the
`done` case), also withhold `overview`/`sections`. Concretely:

```ts
const fields =
  p.existingStatus === 'done'
    ? { idx: p.newIdx }
    : {
        idx: p.newIdx,
        title: p.newTitle,
        overview: p.newOverview,
        sections: p.newSections,
      };
```

This is a straight, mechanical extension of the existing two-way branch — it
introduces no new conditional, no new rejected case, and no new distinction
between `active` and `locked` (milestone 3 is what splits `active` out on its
own).

### 4. Nothing else changes

`lib/journeys/get.ts`, `lib/journeys/list.ts`,
`lib/journeys/updateSyllabusDraft.ts`, `lib/syllabus/schema.ts`, and every UI
file (`lib/components/journey/syllabus-panel-data.ts`, `syllabus-panel.tsx`,
`syllabus-view.tsx`, `syllabus-chat.tsx`) are **not touched** by this milestone.
Nothing reads `chapters.overview`/`chapters.sections` yet — they are write-only
until milestone 3 flips the read path over. Confirmed by inspection: `get.ts`'s
chapter select and `list.ts`'s `chapterCount` subquery in the current codebase
reference only `chapters.summary` and `journeys.syllabus`; neither needs a
change for this milestone's writes to be safe or useful later.

## Why this is safely deployable alone

- `ADD COLUMN ... NOT NULL DEFAULT ...` is a non-locking, backward-compatible
  Postgres migration (Postgres 11+ stores the default as metadata rather than
  rewriting the table). No downtime, no long lock.
- Nothing in the read path (`get.ts`, `list.ts`, prompts, sidebar UI) is
  touched, so byte-for-byte existing behavior is preserved: the sidebar, the
  teaching prompt, and syllabus validation all keep working exactly as they do
  today, still driven entirely by `journeys.syllabus`. This was verified by
  re-checking `lib/journeys/get.ts` and `lib/journeys/list.ts` against the
  end-state diff — those files' changes belong entirely to milestone 3 and are
  absent here.
- `applySyllabusChange`'s existing validation, rejection, and blob-write
  behavior are unchanged — only two additional fields are populated in writes
  that already happen. A proposal that succeeds or fails today succeeds or fails
  identically after this ships.
- This deploy carries zero risk to the live drift bug: the bug is in the _read_
  path (blob-driven sidebar/prompt) and the _lack of validation_ before
  overwriting the blob, neither of which this milestone changes. This is purely
  preparatory.

## Deploy rules

- This migration **can be deployed independently at any time** before milestone
  3 — it has no dependency on milestone 1 or on any other pending change.
- It **must be deployed before, or in the same deploy as, milestone 3**.
  Milestone 3's validation phase reads `chapters.overview`/`chapters.sections`
  to compare against proposals, so those columns must exist and be populated
  with real content (not the `''`/`[]` defaults) by the time that validation
  ships.
- **Interim data caveat:** chapters created via `activateJourney` or
  `applySyllabusChange` between this deploy and milestone 3's cutover will have
  correct, real `overview`/`sections` values. Chapters that already exist at the
  moment this migration runs will have the stale `''`/`[]` defaults until
  touched by one of those two write paths again. This is not a concern in
  practice: the parent plan's overall approach resets the database before
  milestone 3 ships (no backwards compatibility is required — see parent plan's
  Context), so there is no real backfill gap to worry about.
- No disruptive steps are required for this milestone by itself. This is a
  normal, non-disruptive deploy: push to `main`, Vercel auto-deploys, run the
  migration as part of the normal release process.

## Tests

- `lib/chapters/applySyllabusChange.test.ts`:
  - Extend `existingChapters` mock rows and the `ch()` proposal-chapter helper
    with `overview`/`sections` (rows) and `summary`/`sections` (proposals, per
    the existing `ch()` helper's field names — already present) so the Phase 2
    select and Phase 4 plan construction have realistic data to work with.
  - Add assertions that `overview`/`sections` are written on preserved
    (non-done) rows and on inserted rows — e.g. extend the existing "does allow
    renaming a locked chapter" test (or add a sibling test) to assert the
    `update.set` call for the locked chapter includes the expected
    `overview`/`sections` values.
  - Add a case asserting `done` chapters still only get `{ idx }` written (no
    `overview`/`sections`), matching the existing "does not update the title of
    a done chapter" test's pattern.
  - Add a case asserting inserted (brand-new, no-`id`) chapters get
    `overview`/`sections` from the proposal in the `tx.insert(chapters).values`
    call.
  - Assert the Phase 10 blob write (`journeys` update `set`) still includes
    `syllabus: newSyllabus` — i.e. the existing "happy path" tests continue to
    pass unmodified, proving the blob write was not removed.
  - **Do not** add the done/active content-rejection test cases (proposals that
    change a done chapter's overview or an active chapter's overview/sections
    and expect a throw) — those belong to milestone 3.
- `lib/journeys/activate.test.ts`:
  - Extend the `syllabus.chapters` fixture in "updates the journey and inserts
    chapters with the first active" with a `sections` array already present and
    a `summary` string (matching the current, un-renamed `chapterSchema`), and
    update the `ChapterValue` type used to capture `chapterRows` to include
    `overview: string` and `sections: string[]`.
  - Add assertions that each captured chapter row has `overview` equal to the
    source chapter's `summary` and `sections` equal to the source chapter's
    `sections`.

## Verification

```bash
pnpm drizzle-kit generate    # emit the additive migration
pnpm vitest run              # full suite
pnpm lint
```

Manual check (local DB):

1. Draft and activate a journey; inspect the `chapters` table directly (e.g.
   `psql` or a DB GUI) and confirm each row's `overview`/`sections` match the
   syllabus chapter's `summary`/`sections`.
2. Ask the AI for a syllabus change that gets applied; inspect `chapters` again
   and confirm the touched rows' `overview`/`sections` were updated (and that
   `done` rows' `overview`/`sections` were left at whatever they were, since
   `done` rows only get `idx` written).
3. Confirm the sidebar, teaching prompt, and syllabus chat page are visually and
   functionally unchanged — they are still entirely blob-driven
   (`journeys.syllabus`) and never reference the new columns.

## Suggested review order

1. `lib/db/schema.ts` — the new columns; confirms this is additive-only, no
   rename.
2. `lib/journeys/activate.ts` — the simplest of the two dual-write sites.
3. `lib/chapters/applySyllabusChange.ts` — the more delicate dual-write site;
   check carefully that no validation logic or Phase 10 blob-write change snuck
   in.
4. `lib/journeys/activate.test.ts` and
   `lib/chapters/applySyllabusChange.test.ts` — confirm test coverage matches
   the dual-write-only scope (no done/active rejection cases).
