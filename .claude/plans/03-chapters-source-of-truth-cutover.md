# Plan: Chapters-as-source-of-truth — core cutover (milestone 3 of 3)

## Context

This is the final milestone of a three-part breakdown of the parent plan
`chapters-source-of-truth-overview.md` (see that file for the full original
design and root cause analysis). Summary of the bug: a learner's AI-driven
syllabus edit overwrote an **active** chapter's content, stripping its overview
and sections down to just a title. Root cause — chapter content was duplicated
between the `journeys.syllabus` JSONB blob and `chapters` rows, and
`applySyllabusChange` rewrote the whole blob from a model-reconstructed
proposal, so an imperfect reconstruction silently destroyed real data.

Prerequisites — sibling milestones, not yet merged into this codebase:

1. **Milestone 1 — resulting-syllabus UI addition.** Pure UI, no schema changes.
   Adds a read-only "resulting syllabus" block to `syllabus-view.tsx`. As of
   current `main`, `syllabus-view.tsx` has no such block at all — it only
   renders `SyllabusPanel mode="activated"` in the sidebar. This milestone's own
   edit to that file (see §6) depends on milestone 1's block existing first,
   since it renames the field the block reads.
2. **Milestone 2 — additive chapter columns.** Adds `chapters.overview` and
   `chapters.sections`, dual-written from `activate.ts` and
   `applySyllabusChange.ts`. As of current `main`, neither column exists on
   `chapters` (verified by reading `lib/db/schema.ts`) and neither file writes
   them. **This milestone assumes milestone 2 has already shipped** — it does
   not add those columns itself; it only changes who reads them (see §1 and §3
   below for how the migration boundary is drawn).

**This milestone is the actual bug fix, and none of it exists on `main` yet.**
It renames `journeys.syllabus` → `journeys.syllabus_draft`, makes `chapters`
rows the sole source of truth for active/done chapter content, adds the
validation phase in `applySyllabusChange` that rejects proposals which would
alter a done chapter's content or an active chapter's overview/sections, and
flips every remaining reader off the blob and onto the rows or the renamed
column. Every file this plan touches is currently at its pre-refactor baseline —
grep confirms zero hits for `sameSections`, `newOverview`, or `newSections`
anywhere in `lib/chapters/`, and `lib/db/schema.ts` still has
`syllabus: jsonb('syllabus').$type<Syllabus | null>()` unchanged.

It covers essentially all remaining sections of the parent plan: the rest of §1
(rename), §2 (`summary` → `overview` in `lib/syllabus/schema.ts`), the rest of
§3 (`get.ts`, `list.ts`, `updateSyllabusDraft.ts`), the rest of §4
(validation-reject phase + dropping the Phase 10 blob write), §5 (sidebar reads
from rows), the rest of §6 (`syllabus-chat.tsx` field rename, plus milestone 1's
UI block, once it lands, pointed at the renamed field), §7 (`prompts.ts` +
`tool.ts`), and §8 (server actions — confirmed no-op).

**This must ship as a single atomic PR.** There is no safe way to split it
further without reintroducing a compatibility shim, which the parent plan
explicitly declines to do ("No backwards compatibility is required — the DB will
be reset"). See "Why this must ship as one unit" below.

## Decisions (carried over from the parent plan)

- **Field rename `summary` → `overview` end-to-end** in the syllabus Zod schema,
  type, JSON, DB column, prompts, and UI. This is the _forward-looking_ chapter
  overview. The pre-existing `chapters.summary` (the _retrospective_ note
  written on completion in `lib/chapters/complete.ts`) is unrelated and stays
  as-is — do not touch it.
- **`syllabus_draft` is frozen, not nulled, at activation.** It is read in
  exactly one place post-activation: the syllabus chat page, to display "the
  resulting syllabus" the drafting conversation produced (milestone 1's block,
  once it lands, pointed at the renamed field). It is **never** read for the
  sidebar, the teaching prompt, or active-chapter logic — those derive from
  `chapters` rows (current state).

## Data model

- `journeys.syllabus` (JSONB) is renamed to `journeys.syllabus_draft`, same type
  (`Syllabus | null`). This is the one destructive schema change in this
  milestone — a rename, not an additive column, so there is no dual-read/dual-
  write window; every consumer must move to the new name in the same deploy.
- `chapters.overview` (`text`, not null, default `''`) and `chapters.sections`
  (`jsonb`, `string[]`, not null, default `[]`) are assumed to already exist
  from milestone 2's migration by the time this milestone starts. This
  milestone's own migration must express **only** the `syllabus` →
  `syllabus_draft` rename — it must not redeclare or re-migrate the chapter
  columns milestone 2 already added. If milestone 2 has not actually merged yet
  when this milestone starts, land it first; do not fold its column additions
  into this migration.
- `chapters.summary` (nullable `text`, the retrospective completion note) is
  unchanged.

## Changes by area

### 1. Schema + migration

`lib/db/schema.ts` currently has:

```ts
syllabus: jsonb('syllabus').$type<Syllabus | null>(),
```

Change it to:

```ts
syllabusDraft: jsonb('syllabus_draft').$type<Syllabus | null>(),
```

This is the only edit this milestone makes to `lib/db/schema.ts` — the
`chapters.overview`/`chapters.sections` columns are milestone 2's concern and
must already be present by the time this change lands.

The latest committed migration is
`lib/db/migrations/20260627131947_broken_steve_rogers`. After making the schema
edit, run `pnpm drizzle-kit generate` to emit the migration for the column
rename (drizzle-kit will prompt to confirm it's a rename, not a drop+add, for
`syllabus` → `syllabus_draft`; confirm rename to preserve intent in the SQL even
though the DB will be reset and no data survives). Never hand-edit
`_journal.json` or any `snapshot.json` — regenerate only.

### 2. Syllabus schema rename — `lib/syllabus/schema.ts`

Current file has two chapter schemas that must be renamed **together** so they
don't drift apart:

```ts
export const chapterSchema = z.object({
  ...
  summary: z
    .string()
    .max(800)
    .describe('One-paragraph overview of what the chapter covers.'),
  ...
});
```

```ts
export const partialChapterSchema = z.object({
  id: z.string().optional(),
  title: z.string().max(120).optional(),
  summary: z.string().max(800).optional(),
  sections: z.array(z.string().max(200)).max(20).optional(),
});
```

`partialChapterSchema` and its inferred `PartialChapter`/`PartialSyllabus` types
were added by commit `63e7e29` ("feat: introduce PartialSyllabus schema,
replacing DeepPartial<Syllabus> (#43)") — the original plan draft predates this
commit and doesn't mention these symbols at all. Rename **both** `summary`
fields to `overview`:

```ts
export const chapterSchema = z.object({
  ...
  overview: z
    .string()
    .max(800)
    .describe('One-paragraph overview of what the chapter covers.'),
  ...
});

export const partialChapterSchema = z.object({
  id: z.string().optional(),
  title: z.string().max(120).optional(),
  overview: z.string().max(800).optional(),
  sections: z.array(z.string().max(200)).max(20).optional(),
});
```

If only `chapterSchema` is renamed and `partialChapterSchema` is left with
`summary`, the two schemas diverge in field naming and
`lib/syllabus/schema.test-d.ts` (also added by `63e7e29`) will fail to compile —
see Tests below.

`Chapter`/`Syllabus`/`PartialChapter`/`PartialSyllabus` all flow from `z.infer`,
so every consumer that destructures `.overview` instead of `.summary` picks this
up at the type level — which is exactly the compile-time coupling this milestone
relies on (see below).

### 3. Entity layer

- `lib/journeys/get.ts`: rename `Journey.syllabus` → `Journey.syllabusDraft`,
  read from the `syllabus_draft` column (keep the existing `safeParse` guard —
  it's the mechanism that keeps this field, post-activation, purely for
  display). Add `overview: string` and `sections: string[]` to `JourneyChapter`
  and select `chapters.overview`, `chapters.sections` alongside `id`, `idx`,
  `title`, `status`, `summary` in the second query. Active-journey chapter
  content must come entirely from rows after this change — there must be no
  per-index cross-reference into a JSONB blob left anywhere in this file.
- `lib/journeys/activate.ts`: currently inserts chapter rows with only
  `journeyId`, `idx`, `title`, `status`:

  ```ts
  await tx.insert(chapters).values(
    syllabus.chapters.map((c, i) => ({
      journeyId: row.id,
      idx: i,
      title: c.title,
      status: i === 0 ? ('active' as const) : ('locked' as const),
    })),
  );
  ```

  Add `overview: c.overview, sections: c.sections` to each inserted row. Also
  rename the `.set({ ..., syllabus })` on the journey update to
  `.set({ ..., syllabusDraft: syllabus })` — this is the frozen post-activation
  snapshot the resulting-syllabus display reads.

- `lib/journeys/updateSyllabusDraft.ts`: currently writes
  `.set({ syllabus: syllabusSchema.parse(syllabus) })`. Change the column to
  `.set({ syllabusDraft: syllabusSchema.parse(syllabus) })`. The drafting-only
  guard (`status = 'drafting'`) is unchanged.
- `lib/journeys/list.ts`: currently computes `chapterCount` unconditionally from
  the blob:

  ```ts
  chapterCount: sql<number>`COALESCE(jsonb_array_length(${journeys.syllabus}->'chapters'), 0)`,
  ```

  Change this to branch on `journeys.status`: for `active` journeys, count
  `chapters` rows via a correlated subquery
  (`SELECT COUNT(*) FROM chapters WHERE chapters.journey_id = journeys.id`); for
  `drafting` journeys, fall back to
  `jsonb_array_length(journeys.syllabus_draft->'chapters')` (renamed column).
  This is the one place chapter count needs a source switch, since drafting
  journeys have no chapter rows yet.

### 4. `lib/chapters/applySyllabusChange.ts` — the core fix

This is the actual bug fix, and it is entirely unimplemented on current `main` —
none of the validation phase, the `sameSections` helper, the status-conditional
apply logic, or the Phase-10 blob-write removal exist. Current file structure
(phases numbered by the existing code comments):

- Phase 1: confirm the journey exists.
- Phase 2: load every chapter row — currently selects only `id`, `idx`, `title`,
  `status`. **Add `chapters.overview` and `chapters.sections`** to this select.
- Phase 3: require an active chapter; build `existingById`.
- Phase 4: build the `plan: Plan[]` from the proposal. The current `Plan` union
  only carries `newIdx`/`newTitle` on both variants:

  ```ts
  type Plan =
    | {
        kind: 'preserve';
        existingId: string;
        existingStatus: JourneyChapterStatus;
        newIdx: number;
        newTitle: string;
      }
    | { kind: 'insert'; newIdx: number; newTitle: string };
  ```

  Add `newOverview: string` and `newSections: string[]` to both variants,
  populated from `c.overview`/`c.sections` on the corresponding proposal chapter
  in the `.map()` that builds `plan`.

- Phase 5: reject removal of `done`/`active` rows — unchanged.
- Phase 6: resolve `activePlan`, reject inserts before the active chapter —
  unchanged.
- **New Phase 6.5 — the validation-reject phase that is the actual bug fix.**
  Insert this after Phase 6 and before the Phase 7 delete. For every `preserve`
  plan entry, look up the matching row in `existingById` (or keep a separate
  `existingById`-keyed lookup before Phase 4 deletes entries out of it — use the
  original `existing` array, not the now-mutated map) and add a local
  `sameSections` helper:

  ```ts
  const sameSections = (a: string[], b: string[]): boolean =>
    a.length === b.length && a.every((s, i) => s === b[i]);
  ```

  Then, for each preserved entry:
  - `status === 'done'`: reject unless `title`, `overview`, and `sections` (via
    `sameSections`) all match the row exactly, throwing
    `Proposal modifies done chapter "<title>"`. Done chapters are fully
    immutable, including title. Note this **is** a behavior change from the
    pre-milestone-3 code, but not the one the earlier plan draft claimed —
    currently, a done-chapter title change in the proposal is silently ignored
    (Phase 8 only ever writes `{ idx }` for done rows, never `title`), it does
    not throw. After this milestone, the same input throws instead of silently
    discarding the rename attempt. The existing `applySyllabusChange.test.ts`
    "renaming done chapters" test already asserts the current silent-ignore
    behavior and must be rewritten — see Tests below.
  - `status === 'active'`: reject unless `overview` and `sections` match the
    row, throwing `Proposal modifies the active chapter's overview or sections`.
    Title rename is still permitted for the active chapter (no change from
    current behavior).
  - Match the existing throw style used elsewhere in this function: plain
    `Error`, no error codes.

- Phase 7: delete removed locked rows — unchanged.
- Phase 8 (apply phase, currently the two-step preserved-row update): change the
  per-row `fields` computation from

  ```ts
  const fields =
    p.existingStatus === 'done'
      ? { idx: p.newIdx }
      : { idx: p.newIdx, title: p.newTitle };
  ```

  to a three-way branch:
  - `done`: `{ idx: p.newIdx }` only (unchanged — content already verified
    unchanged by Phase 6.5, and title is immutable).
  - `active`: `{ idx: p.newIdx, title: p.newTitle }` (unchanged shape — content
    already verified unchanged by Phase 6.5, so `overview`/`sections` are not
    rewritten).
  - `locked`:
    `{ idx: p.newIdx, title: p.newTitle, overview: p.newOverview, sections: p.newSections }`
    — locked chapters are not protected, so their full content is replaced from
    the proposal.

- Phase 9 (inserts): currently inserts
  `{ journeyId, idx, title, status: 'locked' }`. Add
  `overview: p.newOverview, sections: p.newSections` from the plan entry.
- Phase 10: currently writes both fields:

  ```ts
  await tx
    .update(journeys)
    .set({
      syllabus: newSyllabus,
      currentChapterIndex: activePlan.newIdx,
    })
    .where(and(eq(journeys.id, journeyId), eq(journeys.userId, userId)));
  ```

  **Stop writing the syllabus blob.** Change this to
  `.set({ currentChapterIndex: activePlan.newIdx })` only — `syllabus_draft`
  stays exactly as activation froze it; nothing in this function touches it
  again. This is the change that makes the drift class of bug structurally
  impossible: the function that used to "reconstruct-and-overwrite" the blob no
  longer writes a blob at all.

Also update the function's JSDoc: it currently documents `journeys.syllabus`
being replaced and doesn't mention overview/sections or the new rejection rules
— update it to describe the done/active content-protection behavior and drop the
"`journeys.syllabus` is replaced" line.

### 5. UI — sidebar reads current state from rows

- `lib/components/journey/syllabus-panel-data.ts`:
  - `DisplayChapter.summary` → `DisplayChapter.overview`.
  - `buildDraftChapters`: reads `c.overview` instead of `c.summary` from the
    in-progress draft syllabus (the filter predicate
    `(c): c is PartialChapter & { title: string } => c.title !== undefined` is
    unaffected by the rename — leave it as-is).
  - `buildActivatedChapters` currently does exactly the two-source-of-truth
    cross-reference this whole project exists to eliminate:

    ```ts
    export function buildActivatedChapters(journey: Journey): DisplayChapter[] {
      return journey.chapters.map((chapter, i) => {
        const syllabusChapter =
          journey.syllabus !== null && i < journey.syllabus.chapters.length
            ? journey.syllabus.chapters[i]
            : undefined;
        return {
          title: chapter.title,
          summary: syllabusChapter?.summary,
          sections: syllabusChapter?.sections,
          status: chapter.status,
          href:
            chapter.status !== 'locked'
              ? chapterPath(journey, chapter)
              : undefined,
        };
      });
    }
    ```

    It looks up the parallel-indexed blob chapter by position to pull
    `summary`/`sections`, while taking `title`/`status` from the row — the exact
    pattern that caused the original bug (the blob and the rows can disagree in
    both content and chapter count/order). Rewrite it to map `journey.chapters`
    directly, with no blob lookup at all:

    ```ts
    export function buildActivatedChapters(journey: Journey): DisplayChapter[] {
      return journey.chapters.map((chapter) => ({
        title: chapter.title,
        overview: chapter.overview,
        sections: chapter.sections,
        status: chapter.status,
        href:
          chapter.status !== 'locked'
            ? chapterPath(journey, chapter)
            : undefined,
      }));
    }
    ```

    `overview`/`sections` become always-defined strings/arrays (not optional)
    once sourced from the row, since milestone 2's columns are `notNull`. Update
    `DisplayChapter`'s `overview`/`sections` fields accordingly if you want to
    tighten the type, but keep them optional if `buildDraftChapters` still needs
    to produce `undefined` for chapters missing those fields mid-stream — check
    both callers before narrowing.

- `lib/components/journey/syllabus-panel.tsx`: rename the local `summaryContent`
  variable to `overviewContent` and render `chapter.overview` instead of
  `chapter.summary`:

  ```ts
  const overviewContent =
    chapter.overview !== undefined ? (
      <span className="font-sans text-xs font-normal">{chapter.overview}</span>
    ) : null;
  ```

  and reference `overviewContent` in the returned JSX where `summaryContent` is
  currently used.

### 6. UI — syllabus chat page shows the resulting (frozen) syllabus

- `app/[locale]/journeys/[journeySlug]/syllabus/syllabus-view.tsx`: as of
  current `main` this file has **no** resulting-syllabus block — it only renders
  `SyllabusPanel current={{ type: 'syllabus' }} journey={journey} mode="activated"`
  in the sidebar. Adding that block is milestone 1's job, not this milestone's.
  **This milestone's dependency:** land milestone 1 first. Once its
  resulting-syllabus block exists (reading `journey.syllabus`, the pre-rename
  field name, per milestone 1's own plan), this milestone renames that reference
  to `journey.syllabusDraft` as part of the same `Journey` type change. If
  milestone 1 hasn't landed when this milestone starts, there is nothing to
  rename in this file yet — do not invent the block here; that would blur the
  two milestones' scope.
- `app/[locale]/journeys/[journeySlug]/syllabus/syllabus-chat.tsx` (drafting, in
  progress): line 111 currently reads

  ```ts
  const draft = journey.syllabus;
  ```

  Change to

  ```ts
  const draft = journey.syllabusDraft;
  ```

  This is the only edit needed in this file — `startable` and
  `handleStartJourney` downstream consume the local `draft` variable, not the
  raw `journey.syllabus` field, so they need no further changes.

### 7. Prompts & tools

- `app/api/journeys/[journeyId]/chapters/[chapterId]/chat/prompts.ts`: fully
  pre-refactor as of current `main`. Two separate edits are needed:
  1. The `chapterPhase` prose. English currently reads:

     > Use the chapter title, summary, and sections below as the source of truth
     > for what to cover.

     Change "summary" → "overview" in that sentence. French currently reads:

     > Utilisez le titre, le résumé et les sections du chapitre ci-dessous comme
     > référence pour ce qui doit être couvert.

     Change "le résumé" → "l'aperçu" (or another natural French rendering of
     "overview" consistent with the rest of the French copy — confirm with a
     native-French reviewer if `l'aperçu` doesn't read naturally in context).

  2. The function body. Currently:

     ```ts
     if (journey.syllabus === null) {
       throw new Error(
         'Cannot compose chapter prompt: journey has no syllabus',
       );
     }
     const fullChapter = journey.syllabus.chapters[chapter.idx];
     const sections =
       fullChapter.sections.length > 0
         ? `\nSections:\n${fullChapter.sections.map((s) => `- ${s}`).join('\n')}`
         : '';
     const summary =
       fullChapter.summary.length > 0 ? `\n\n${fullChapter.summary}` : '';
     ```

     Drop the `journey.syllabus === null` throw and the
     `journey.syllabus.chapters[chapter.idx]` lookup entirely — source
     `overview`/`sections` straight from the `chapter` row parameter instead
     (available once milestone 2's `overview`/`sections` columns are read by
     `get.ts`, per §3):

     ```ts
     const sections =
       chapter.sections.length > 0
         ? `\nSections:\n${chapter.sections.map((s) => `- ${s}`).join('\n')}`
         : '';
     const overview =
       chapter.overview.length > 0 ? `\n\n${chapter.overview}` : '';
     ```

     Update the template string below (`${chapter.title}${summary}${sections}`)
     to use `${overview}` instead of `${summary}`.

- `app/api/journeys/[journeyId]/syllabus/chat/tool.ts`: the
  `updateSyllabusDraft` tool's inline `description` string (per the "a feature
  owns its AI config" convention — not localized, since it instructs the model
  rather than the user) currently has **three** occurrences of "summary" that
  need renaming, not the single line an earlier plan draft assumed. Commit
  `ee6c99b` ("fix: clarify updateSyllabusDraft tool schema and make summary
  optional (#40)") added the `sections`-is-an-array-of-strings bullet and the
  "Example input" JSON block after the original bullet, both containing literal
  `"summary"` text. Current full description text:

  ```
  Replace the entire syllabus draft with the new version.

  Rules:
  - Always pass ALL chapters, even ones that have not changed — this is a full replace, not a patch.
  - Call this tool immediately whenever the outline changes; do not narrate changes in prose instead.
  - Use concise chapter titles (noun phrases, ≤ 120 chars). Add a short summary only when it adds clarity.
  - Order chapters from foundational to advanced.
  - Each chapter's `sections` is an array of plain strings (section title labels), not objects. Must have at least one entry.

  Example input:
  {
    "chapters": [
      {
        "title": "Introduction to the Roman Empire",
        "summary": "Geographic and political foundations of Rome's rise.",
        "sections": ["Geography and early settlements", "The founding myths"]
      },
      {
        "title": "The Republic",
        "summary": "Rome's republican system, its political tensions, and expansion through conflict.",
        "sections": ["Senate and governance", "Conflict with Carthage"]
      }
    ]
  }
  ```

  Rename all three: the bullet's "summary" → "overview", and both JSON example
  objects' `"summary": "..."` keys → `"overview": "..."`. The rest of the file
  (`inputSchema: syllabusSchema`, the `execute` callback) needs no change — it
  already passes through whatever shape `syllabusSchema` defines.

- `app/api/journeys/[journeyId]/chapters/[chapterId]/chat/tools.ts`
  (`createProposeSyllabusChangeTool`): uses `syllabusSchema` directly for its
  input and its description prose does not name the `summary`/`overview` field
  anywhere (verified by reading the current description string in full) — it
  picks up `overview` automatically once the schema is renamed, no text change
  needed here. Confirm during review that no other string in this file says
  "summary" in a syllabus-chapter context (as opposed to `chapters.summary`, the
  unrelated completion note, which must **not** be renamed).

### 8. Server actions — confirmed no-op

- `app/[locale]/journeys/[journeySlug]/syllabus/activate-journey.ts` and
  `app/[locale]/journeys/[journeySlug]/[chapterSlug]/apply-syllabus-change.ts`
  both validate with `syllabusSchema` and forward to `activateJourney` /
  `applySyllabusChange`. Neither destructures `.summary`/`.overview` directly or
  references `journey.syllabus`/`syllabusDraft` by name — confirmed by
  inspection. They need no logic change; the renamed field flows through their
  generic `Syllabus`-typed parameters. This section is a confirmation step
  during review, not a code change.

## Why this must ship as one unit

The rename and the field change are not additive — they are compile-time
breaking changes to shared types:

- `Journey.syllabus` is removed and replaced by `Journey.syllabusDraft` in
  `lib/journeys/get.ts`. Every file that imports `Journey` or destructures
  `journey.syllabus` (`syllabus-chat.tsx`, `syllabus-view.tsx` once milestone 1
  lands, `syllabus-panel-data.ts`, `prompts.ts`, any server action typed against
  `Journey`) fails `tsc` the moment the type changes, not at runtime.
- `chapterSchema.summary` is removed and replaced by `chapterSchema.overview` in
  `lib/syllabus/schema.ts`. Since `Chapter`/`Syllabus` are `z.infer`'d from this
  schema, every consumer that reads `.summary` off a `Chapter` value (the tool
  description aside — that's a plain string, not a type error, which is
  precisely why it can silently go stale, as it did here) fails to compile if it
  still expects the old shape in a typed position.

Next.js/Vercel cannot deploy a broken TypeScript build — `next build` fails the
deploy outright. That means there is no way to merge, say, "just the schema
rename" and follow up later with "the UI consumers": the moment the schema
rename lands, every consumer must already be updated, or `main` stops building
and Vercel's auto-deploy on push fails closed. A partial rollout would require
keeping both `syllabus`/`summary` and `syllabusDraft`/`overview` alive
simultaneously as a compatibility shim — which the parent plan explicitly
rejects ("No backwards compatibility is required — the DB will be reset"). So
this milestone is, by construction, one atomic commit-and-deploy unit, even
though it touches many files.

## Deploy rules

This milestone requires a coordinated, disruptive deploy — do not treat it as a
routine merge-and-forget PR.

1. **Before merge:** run `pnpm drizzle-kit generate` to emit the migration for
   the `syllabus` → `syllabus_draft` rename. Never hand-edit `_journal.json` or
   any `snapshot.json` — regenerate only, and include the generated migration
   directory in this PR.
2. **Merge this PR.** It contains the full atomic cutover: schema, entity layer,
   validation, UI, prompts, tools, and the migration.
3. **The production database must be reset as part of this deploy.** There is no
   backfill path: the `summary` → `overview` JSONB shape change inside
   `syllabus_draft` has no migration for existing rows' JSON content, and the
   `syllabus` → `syllabus_draft` rename (even though drizzle can express it as a
   rename at the column level) leaves any pre-existing JSON blob in the old
   `{ chapters: [{ summary, ... }] }` shape, which the new `overview`-keyed Zod
   schema will fail to `safeParse` — falling back silently to `null` rather than
   crashing, per `get.ts`'s `safeParse` handling, but that still means a reset
   is required to avoid silently losing every existing drafting-syllabus's
   content. **Call this out explicitly to whoever schedules the deploy: this is
   a destructive, data-losing step (all existing journeys and chapters), and
   must be communicated and scheduled deliberately** — not silently rolled out
   during a routine push to `main`. This is consistent with the parent plan's
   explicit statement: "No backwards compatibility is required — the DB will be
   reset."
4. **Sequencing:** reset the database in the same maintenance window as this
   deploy goes live — immediately before or immediately after, with no gap in
   between. Do not let old-shaped data sit against new-shaped code (queries will
   select columns that no longer exist under the old name) or new-shaped code
   deploy against a database that still has the old schema (the migration itself
   must run before the new code can query
   `syllabus_draft`/`chapters.overview`/`chapters.sections` — though those
   chapter columns should already exist from milestone 2, only the rename is new
   here, assuming milestone 2 shipped first as required above). Coordinate
   migration run + code deploy + data reset as one sequence, not three
   independent events.

## Tests

All test updates land in this same PR, alongside the code they cover (per the
"write unit tests with new code" convention) — none of this is deferred. Note
that these files are currently at their pre-refactor baseline too; "update"
below means implement the change against the current fixtures read from disk,
not adjust an already-updated fixture.

- `lib/chapters/applySyllabusChange.test.ts`:
  - The `ch()` fixture helper builds proposal chapters with
    `summary: '' as const, sections: ['Overview']` — rename to
    `overview: '' as const`. `existingChapters` and other inline row fixtures
    need `overview`/`sections` fields added once Phase 2 selects them.
  - **Rewrite** the existing "renaming done chapters" describe block: the "does
    not update the title of a done chapter" test currently asserts the proposal
    _resolves_ with the title silently unchanged
    (`await applySyllabusChange(...)` with no `.rejects`) — after this
    milestone, the same input must **throw**
    `Proposal modifies done chapter "..."` instead. Update the test to use
    `.rejects.toThrow(...)`.
  - Add cases:
    - done chapter title change → throws `Proposal modifies done chapter "..."`.
    - done chapter overview change (same title) → throws (same error).
    - done chapter sections change (same title/overview) → throws (same error).
    - active chapter overview change → throws
      `Proposal modifies the active chapter's overview or sections`.
    - active chapter sections change → throws (same error).
    - active chapter title-only rename with unchanged overview/sections →
      resolves (title change is still permitted for active — matches the
      existing "returns updated title when the active chapter is renamed"
      happy-path test, which should keep passing unmodified since it doesn't
      change overview/sections).
    - happy path (locked chapter reorder/rename) still applies overview/sections
      from the proposal onto the row.
- `lib/journeys/get.test.ts`: all five test cases construct `syllabus`/
  `chapters` fixtures and assert on `journey.syllabus`. Rename the asserted
  field to `journey.syllabusDraft`, rename the mocked column name in the
  `mockDb.select.from.where` fixtures from `syllabus` to whatever the new select
  alias reads (still sourced from the `syllabus_draft` column), and add
  `overview`/`sections` to the `chapters` row fixtures and expected output (the
  second `mockDb...orderBy` mock currently returns rows with only `id`, `idx`,
  `title`, `status`, `summary`).
- `lib/journeys/activate.test.ts`: the `syllabus.chapters` fixture uses
  `summary` — rename to `overview`. Assert the captured `chapterRows` (via the
  `insertChapters.values` mock) include `overview`/`sections` copied from the
  input syllabus, not just `status`.
- `lib/journeys/list.test.ts`: current test only mocks
  `mockDb.select.from.where.orderBy.limit` and asserts on the returned rows — it
  does not inspect the constructed SQL, so the `chapterCount` branching logic
  added in §3 isn't exercised by the existing assertions at all. Add cases that
  construct journeys with `status: 'active'` vs `status: 'drafting'` and assert
  the resulting `chapterCount` reflects the correct source (this will likely
  require either inspecting the built query text/args passed to the mock, or
  restructuring the test to stub the two code paths distinctly — follow this
  file's existing chain-mock conventions).
- `lib/journeys/updateSyllabusDraft.test.ts`: the `syllabus.chapters` fixture
  uses `summary` — rename to `overview`. No other changes needed; the test
  doesn't inspect which column name the `.set()` targets today, only that the
  call resolves and is scoped correctly, so add an assertion that the write
  targets the `syllabusDraft` field if you want to guard the rename itself.
- `lib/syllabus/schema.ts` also has a colocated `lib/syllabus/schema.test.ts` —
  rename `summary` → `overview` throughout its fixtures and assertions for both
  `chapterSchema` and `partialChapterSchema` cases.
- `lib/syllabus/schema.test-d.ts` (added by commit `63e7e29`) type-checks
  `keyof PartialChapter` against `keyof Chapter` and
  `Chapter extends PartialChapter` generically — it contains no hardcoded field
  names, so no edit is needed to this file's content. It still belongs in this
  PR's verification: run it (via `pnpm test`, which includes
  `vitest --typecheck` for `.test-d.ts` files, or a dedicated typecheck script —
  check `package.json`) to confirm the two schemas' `summary` → `overview`
  renames in §2 were applied in lockstep. If only one schema is renamed, this
  file is what catches the drift at compile time.
- `lib/components/journey/syllabus-panel.test.tsx`: `baseJourney` fixture has
  `syllabus.chapters[].summary` and asserts
  `buildActivatedChapters(...).summary` pulled from the blob by index, including
  a test explicitly titled "joins journey.chapters with
  journey.syllabus.chapters by index" and one for "uses undefined summary and
  sections when syllabus chapter is missing" (i.e. index out of range). Rewrite
  this whole describe block: `journey.chapters` rows must carry their own
  `overview`/`sections` directly (add those fields to the `chapters` array
  fixture entries instead of relying on the parallel `syllabus.chapters` array),
  assert `buildActivatedChapters` output pulls `overview` from the matching
  **row**, and delete or repurpose the "missing/out-of-range" test since there's
  no more index-based lookup to go out of range — every row fully determines its
  own display chapter now. This is the regression test that should fail if a
  stale blob-lookup pattern is reintroduced.
- `app/api/journeys/[journeyId]/syllabus/chat/tool.test.ts`: the `syllabus`
  fixture used in the `execute` tests has `chapters[0].summary` — rename to
  `overview`. This file does **not** currently assert on the tool's
  `description` string at all, so there is no description-text assertion to
  update — only the fixture fallout applies.
- `app/api/journeys/[journeyId]/syllabus/chat/prompts.test.ts`: current tests
  only assert on style-fragment prefixing and locale-specific phase prose — they
  never construct a `Syllabus`/`Chapter` fixture, so no field-rename fallout
  applies here. No change needed.
- `app/api/journeys/[journeyId]/chapters/[chapterId]/chat/route.test.ts`: the
  `activeJourney` fixture has
  `syllabus: { chapters: [{ title, summary, sections }] } }` and a `chapters`
  array whose entries have only `id`, `idx`, `title`, `status`, `summary` (the
  retrospective note, which stays `null` and unrenamed). Rename `syllabus` →
  `syllabusDraft` and its nested `summary` → `overview`, and add
  `overview`/`sections` to the `chapters` row entries (required once
  `JourneyChapter` gains those fields). `composeChapterSystemPrompt` is mocked
  in this file (`vi.mock('./prompts', ...)`), so there is currently no assertion
  tied to the `journey.syllabus === null` throw path in this specific file to
  remove — the throw itself lives in `prompts.ts` and is removed as part of the
  §7 code change, not as a test deletion here. The fixture rename is needed
  purely to keep `mockGetJourney.mockResolvedValue` type-checking against the
  updated `Journey` type.
- `app/[locale]/journeys/[journeySlug]/syllabus/activate-journey.test.ts`: the
  `validSyllabus` fixture (`chapters: [{ title, summary, sections }]`) and the
  `mockGetJourney.mockResolvedValue({ ..., syllabus: ... })` fixtures need
  `summary` → `overview` and `syllabus` → `syllabusDraft` renames to type-check
  against the updated `Journey`/`Syllabus` types.
- `app/[locale]/journeys/[journeySlug]/syllabus/bootstrap.test.ts`: the
  `draft = { chapters: [{ title, summary, sections }] }` fixture in the
  "includes the serialized syllabus draft as JSON" test needs `summary` →
  `overview`.

## Verification

```bash
pnpm drizzle-kit generate          # emit the syllabus_draft rename migration
pnpm vitest run                     # full suite, including schema.test-d.ts
pnpm lint
```

End-to-end (reset DB, `pnpm dev`):

1. Draft a journey, watch the sidebar build live from the drafting syllabus,
   click **Start journey**.
2. On an active chapter, ask the AI for a change that _renames a locked chapter
   and adds a chapter after the active one_ → Apply → sidebar reflects the new
   state, sourced from `chapters` rows.
3. Ask for a change that _alters the active chapter's overview/sections_ → the
   server rejects the proposal; the active chapter's content in the sidebar is
   untouched. This is the direct regression test for the original bug report.
4. Revisit the syllabus chat page → it shows the resulting (frozen) syllabus in
   the content area, sourced from `syllabusDraft`; the sidebar shows current
   (possibly changed) chapter state, sourced from `chapters` rows.

## Suggested review order

1. `lib/db/schema.ts` — the renamed column; confirm milestone 2's
   `chapters.overview`/`chapters.sections` are already present before this diff,
   since everything else assumes they exist.
2. `lib/syllabus/schema.ts` — `summary` → `overview` on both `chapterSchema` and
   `partialChapterSchema`, the type-level change that ripples through every
   consumer.
3. `lib/journeys/get.ts` — the `Journey`/`JourneyChapter` contract that UI and
   prompts depend on; confirms `syllabusDraft` and row-sourced
   overview/sections.
4. `lib/chapters/applySyllabusChange.ts` — the core fix: the new validation
   phase and the removal of the Phase 10 blob write.
5. `lib/journeys/activate.ts`, `lib/journeys/list.ts`,
   `lib/journeys/updateSyllabusDraft.ts` — the remaining entity-layer read/write
   paths.
6. `lib/components/journey/syllabus-panel-data.ts` +
   `lib/components/journey/syllabus-panel.tsx` — the sidebar fix that eliminates
   the user-visible drift.
7. `app/[locale]/journeys/[journeySlug]/syllabus/syllabus-view.tsx` +
   `syllabus-chat.tsx` — confirm the page-display split (resulting syllabus vs.
   current state) is correctly wired to the renamed field, and confirm milestone
   1's block has landed before this rename touches it.
8. `app/api/journeys/[journeyId]/chapters/[chapterId]/chat/prompts.ts` +
   `app/api/journeys/[journeyId]/syllabus/chat/tool.ts` — the AI-facing text and
   prompt-composition source changes, including all three "summary" → "overview"
   occurrences in `tool.ts`.
9. Tests.
