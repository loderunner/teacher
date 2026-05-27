# Story 4 — Propose Syllabus Change (D3.4) ✅ Done

## Context

Stories 1–3 of D3 (see `.claude/plans/03-01-chapter-page.md`,
`.claude/plans/03-02-chapter-chat.md`, and
`.claude/plans/03-03-chapter-completion.md`) have shipped a working chapter
destination: the journey URL redirects to the active chapter, the chapter page
renders the two-column shell with a streaming `ChapterChat` client island, and
the chat already wires two tools — `updateMemory` (silent, server-side) and
`markChapterComplete` (signal-only, surfaces a "Go to next chapter" button that
calls `completeChapterAction`).

Story 4 adds the **third** chapter-chat tool and the missing user-confirmed
mutation in the system: the AI can decide that the syllabus itself needs to
change — typically because the learner asked for a deeper dive that warrants a
new chapter, or because a section turned out to be unnecessary and can be
skipped — and call `proposeSyllabusChange` with the proposed full new syllabus
and a short reason. The client renders an inline confirmation card inside the
assistant message with two buttons: **Apply** or **Dismiss**.

On **Apply**, a new `applySyllabusChangeAction`:

1. Replaces the journey's `syllabus` JSONB with the proposal.
2. Reconciles the `chapters` table: preserves `done` and `active` rows by
   title-match (with their `id`, `status`, and `summary` intact), deletes
   `locked` rows that were removed, inserts brand-new chapters as `locked`,
   re-indexes everything to match the new ordering.
3. Bumps `journeys.currentChapterIndex` to the new idx of the (preserved) active
   chapter.
4. Returns the canonical path of the active chapter — which may differ from the
   current URL if the current chapter was renamed, in which case the client
   `router.push`es to the new path.

On **Dismiss**, the tool part is marked as dismissed in session-local UI state;
nothing else happens. The chat continues. The dismissal state is lost on refresh
(acceptable — Story 5 will persist tool parts alongside chat messages and the
dismissal flag can be added there if needed).

What stays deferred to Story 5:

- Persisting chat history (and thus the proposal tool-call part) to a `messages`
  table. Story 4's tool parts are still ephemeral, exactly like `updateMemory`
  and `markChapterComplete` parts in Stories 2 and 3. This is acceptable: a
  proposal is meant to be confirmed or dismissed immediately within the same
  session. Refresh wipes the chat — a fresh proposal can always be solicited
  again.

---

## Decisions

- **`proposeSyllabusChange` is a signal-only tool.** Same pattern as
  `markChapterComplete` from Story 3: the model proposes, the user confirms, the
  server does the work. The tool's `execute` is a no-op returning
  `{ ok: true }`. Rationale: keeps user agency — syllabus changes are disruptive
  enough that they should never be silent, and they must never race with
  concurrent chat turns. The Zod input schema carries the **full** new syllabus
  and a short `reason` string:

  ```ts
  z.object({
    reason: z.string().min(1).max(500),
    newSyllabus: syllabusSchema,
  });
  ```

  This requires extending `chapterSchema` in `lib/server/syllabus/schema.ts` to
  carry an **optional** `id: z.string().optional()` field. Existing call sites
  (`updateSyllabusDraft` in the welcome chat, where chapters don't yet have IDs)
  are unaffected because the field is optional; the `proposeSyllabusChange` tool
  description tells the model when to set it (rename/reorder/preserve) and when
  to omit it (new chapter).

- **Tool description is inline English, not localised.** Four core rules: (1)
  fire only when there is a concrete pedagogical reason from the conversation;
  (2) pass the **full** new syllabus, never a delta; (3) for every chapter that
  maps to an existing one, include its **`id`** from the syllabus block in the
  system prompt (this is how rename/reorder are detected); for brand-new
  chapters, omit `id`; (4) preserve `done` and `active` chapters by ID —
  removing them is rejected server-side. The description also reminds the model
  that the user must confirm and that proposing a change disrupts flow — to be
  used sparingly.

- **System prompt extension.** Two changes to `composeChapterSystemPrompt` in
  `lib/chapter-chat/prompts.ts`:
  1. **Expose chapter IDs in the syllabus block.** Switch the outline source
     from `journey.syllabus.chapters` (JSONB, no IDs) to `journey.chapters`
     (table rows, always have IDs) and prepend each line with the ID in
     brackets: `${idx + 1}. [${id}] ${title}`. The model is instructed to copy
     IDs back when proposing a change that preserves a chapter.
  2. **Append a paragraph** to both `chapterPhase.en` and `chapterPhase.fr`
     describing when and how to call `proposeSyllabusChange`, alongside the
     existing `updateMemory` and `markChapterComplete` paragraphs.

  No structural change to the composer signature.

- **ID-based reconciliation.** Match existing chapter rows to proposed chapters
  by `chapters.id` (the existing 10-char `nanoid` from D2 — now also surfaced in
  the URL per Story 1). The model sees IDs in the system prompt and is
  instructed to round-trip them on every preserved chapter; new chapters omit
  the `id` field. Title matching was considered and rejected because renames are
  an explicit use case for this story (the model proposes a new title for an
  existing chapter) and any title-based scheme can't distinguish a rename from a
  delete + insert.

- **Preserve `done` and `active` chapter rows.** Matched rows keep their `id`,
  `status`, and `summary`. Only `idx` is updated to match the new ordering. This
  is the load-bearing invariant: learner progress (summaries, done-state)
  survives a syllabus change.

- **Removed `done`/`active` chapters → reject the proposal server-side.** The
  model is instructed not to remove these, but defense-in-depth requires the
  server to refuse the apply if the proposal would drop a chapter the user has
  already engaged with. The action throws and the client surfaces an inline
  error next to the Apply button.

- **Removed `locked` chapters → delete.** No persisted state lost.

- **New chapters → insert as `locked`** with their title preserved. They never
  enter as `active` from this code path — the only `active` chapter remains the
  previously-`active` chapter (now possibly re-indexed). If the unusual case
  arises where the journey somehow has no `active` chapter at proposal time, the
  action throws "Invalid journey state". This should not happen in the
  chapter-chat flow (you have to be in an active chapter to be chatting).

- **Re-indexing strategy: two-phase update inside the transaction.** Because of
  the `chapters_journey_idx_unique` unique index on `(journeyId, idx)`, updating
  `idx` values in place risks collisions during the intermediate state. The
  transaction:
  1. **Validate** the proposal against the current chapter set (title matching +
     reject if any `done`/`active` chapter was removed).
  2. **Delete** locked-removed chapter rows.
  3. **Shift** all preserved chapter rows to a high temporary range (negative
     integers, e.g. `idx = -1 - preservedArrayIndex`). Negative offsets avoid
     any conceivable collision with the new positive idx values; `chapters.idx`
     has no CHECK constraint so negatives are allowed by the schema.
  4. **Update** each preserved row to its final positive idx in the new ordering
     (single UPDATE per row, scoped by `id`).
  5. **Insert** any brand-new chapters at their final idx with
     `status = 'locked'`.
  6. **Update** `journeys.syllabus` and `journeys.currentChapterIndex` (new idx
     of the preserved active chapter).

  All inside one `dbTx.transaction` so partial state can never be observed.

- **Entity function** `lib/server/chapters/applySyllabusChange.ts` exports
  `applySyllabusChange({ userId, journeyId, newSyllabus })` →
  `{ currentChapter: { idx, title } }`. Single ownership gate via the parent
  `journeys.userId` (mirrors `completeChapter` from Story 3). Returns the
  post-reconciliation idx and title of the active chapter so the action can
  compute the canonical path.

- **Server action**
  `app/[locale]/journeys/[journeySlug]/[chapterSlug]/_components/apply-syllabus-change.ts`.
  Mirrors Story 3's `complete-chapter.ts`: auth, Zod-validate inputs, delegate
  to `applySyllabusChange`, compute the new `chapterPath` from the refreshed
  journey state, return `{ chapterPath }` so the client can `router.push` only
  if the path changed.

- **Inline confirm card, not a separate Dialog.** v1 surfaces the proposal
  inline in the assistant message bubble — same pattern as Story 3's "Go to next
  chapter" button, just richer (Markdown reason + categorical diff + two
  buttons). Rationale: a modal Dialog would block the chat while the user reads
  the proposal; an inline card lets the user re-read prior context to inform
  their decision and matches the visual rhythm of the conversation. The shadcn
  `<Dialog>` primitive stays available as a future upgrade path if syllabi grow
  large enough to need a full-screen diff view — for v1 the categorical diff is
  compact enough to fit inline.

- **Dismissal is session-local.** The chapter chat keeps a `useState`
  `Set<string>` of dismissed part IDs (keyed by message id + part index, since
  parts have no stable ids of their own). When a `tool-proposeSyllabusChange`
  part renders, the `renderPart` callback checks the set — if dismissed, it
  renders a faint "Dismissed" label instead of the card. Refresh wipes the state
  along with the chat itself (consistent with the rest of the chapter chat
  history in Story 4).

- **Apply path: `router.push` vs. `router.refresh`.** After a successful apply,
  the action returns `{ chapterPath }`. The client compares it to the current
  URL: if it changed (current chapter was renamed → slug changed),
  `router.push(chapterPath)`; otherwise `router.refresh()` so the server
  re-renders the sidebar `SyllabusPanel` with the new chapter list.
  `router.refresh` is the correct primitive here: the chapter page is a server
  component reading `getJourney`, so a refresh repopulates the panel without
  remounting client state.

- **Diff display.** A simple categorical diff is enough for v1: _Added: …_,
  _Removed: …_, _Renamed: A → B_, _Reordered chapters_. Computed by matching
  titles between the current `journey.syllabus.chapters` and the proposed
  `newSyllabus.chapters` (the same normalised-title match the server uses).
  Sections of new/renamed chapters are not enumerated — just the chapter-level
  categorical diff. The helper lives next to the inline card component so it is
  co-located with its only consumer.

- **`useTransition`-pending Apply button.** While the action is in flight, both
  buttons are disabled and the Apply button shows a spinner. Errors surface as
  an inline `<p className="text-sm text-destructive">` below the buttons using
  `t('proposalApplyError')`.

- **Sidebar panel auto-update is free.** `<SyllabusPanel mode="navigate">` is a
  server-rendered component fed by `getJourney`. Both `router.push` and
  `router.refresh` rehydrate it from the server. No client state to manage
  there.

- **No new tests.** `messages/parity.test.ts` is kept green by adding the new
  keys to both `en.json` and `fr.json` in the same commit. Verification is
  manual end-to-end.

- **AI Gateway model strings unchanged.** Story 4 doesn't introduce any new
  model call — the tool is signal-only, the reconciliation runs server-side with
  plain SQL — so the existing `'anthropic/claude-sonnet-4-6'` string in the
  chapter-chat route is untouched.

---

## Files to modify

### 0. `lib/server/syllabus/schema.ts` — extend `chapterSchema` with optional `id`

Add a single optional field so existing chapters can be round-tripped through
the tool input:

```ts
export const chapterSchema = z.object({
  id: z.string().optional(), // ← new; absent for new chapters
  title: z.string().min(1),
  summary: z.string().optional(),
  sections: z.array(z.string()).optional(),
});
```

Existing call sites:

- `updateSyllabusDraft` (welcome chat) keeps emitting chapters without `id` —
  chapters don't exist yet during the draft phase. The optional field is
  silently dropped.
- The persisted `journeys.syllabus` JSONB may or may not have IDs (depending on
  whether it was written before or after this story). Story 4's reconciliation
  reads IDs from `journey.chapters` (the table rows, which always have IDs), not
  from the JSONB, so no migration is required.

### 1. `lib/chapter-chat/tools.ts` — add `createProposeSyllabusChangeTool`

Add a third factory alongside `createUpdateMemoryTool` (Story 2) and
`createMarkChapterCompleteTool` (Story 3). The factory shape keeps the call site
symmetric with the others and leaves room for later closure-captured params
without a breaking signature change.

```ts
import { tool } from 'ai';
import { z } from 'zod';

import { syllabusSchema } from '@/lib/server/syllabus/schema';

/**
 * Builds an AI SDK tool that lets the model propose a full replacement of
 * the journey's syllabus, surfaced to the learner as a confirmation card.
 *
 * Signal-only: the tool emits a recognisable tool part; the actual apply
 * happens in `applySyllabusChangeAction` when the user clicks Apply.
 *
 * @returns A `proposeSyllabusChange` tool.
 */
export function createProposeSyllabusChangeTool() {
  return tool({
    description: `Propose a replacement for the journey's syllabus. Fire this tool only when there is a concrete pedagogical reason in the current conversation — the learner asked for a deeper dive that warrants its own chapter, or wants to skip a section that turned out to be unnecessary, etc.

Rules:
- Always pass the FULL new syllabus, never a partial delta. The server replaces the syllabus wholesale.
- Each existing chapter in the system prompt's syllabus block is prefixed with its id in brackets, e.g. "1. [abc123def4] Installing Python". For every chapter in your proposal that maps to an existing one (preserved, reordered, or renamed), copy its id into the chapter object's \`id\` field verbatim. For brand-new chapters you are inserting, omit \`id\` entirely.
- Renaming a chapter is expressed by keeping its existing \`id\` and changing its \`title\`. Reordering is expressed by keeping ids the same and changing the array order.
- The server rejects any proposal that drops an id belonging to a \`done\` or \`active\` chapter. Never remove the learner's completed or current chapters.
- Do not propose to change the title of the chapter currently being taught unless the learner asked for it. Renaming the current chapter mid-chapter is disruptive.
- The user must confirm the proposal by clicking Apply. After firing the tool, end your message — do not continue teaching in the same turn. Use this tool sparingly: a proposed change interrupts flow.
- Include a short \`reason\` (one or two sentences in the learner's language) explaining why the change is helpful. The reason is shown to the learner above the diff.`,
    inputSchema: z.object({
      reason: z.string().min(1).max(500),
      newSyllabus: syllabusSchema,
    }),
    execute: async () => ({ ok: true }),
  });
}
```

### 2. `lib/chapter-chat/prompts.ts` — expose chapter IDs and extend `chapterPhase`

(a) **Syllabus block — switch source to `journey.chapters` and include IDs.**
The Story 2 sketch derived the outline from `journey.syllabus.chapters` (no IDs
available there). Story 4 switches to `journey.chapters` (table rows, always
carry `id`):

```ts
const syllabusOutline = journey.chapters
  .map((c) => `${c.idx + 1}. [${c.id}] ${c.title}`)
  .join('\n');
```

Result in the prompt:

```
## Syllabus
1. [abc123def4] Installing Python
2. [xyz789ghi3] Variables and types
3. [mno456pqr2] Control flow
```

The current-chapter block stays as-is; the model can already correlate by id.

(b) **Append a paragraph** to both locale strings describing
`proposeSyllabusChange`. Leave the existing `updateMemory`,
`markChapterComplete`, and the latency hint paragraphs in place. English sketch
(mirror French phrasing in the same structure):

```ts
const chapterPhase: Record<Locale, string> = {
  en: `You are teaching a single chapter of an ongoing learning journey.

[…existing paragraphs from Stories 2 and 3 — chapter scope, updateMemory, markChapterComplete…]

You have a \`proposeSyllabusChange\` tool. Use it only when there is a concrete pedagogical reason in the conversation — the learner asked for a deeper dive that warrants its own chapter, or wants to skip a section that turned out to be unnecessary. Always pass the FULL new syllabus. For each chapter that maps to an existing one in the syllabus block above, copy its bracketed id into the chapter's \`id\` field verbatim; for brand-new chapters, omit \`id\`. Renaming is "same id, new title"; reordering is "same ids, new order". Never drop a \`done\` or \`active\` chapter's id — the server will reject the proposal. Do not rename the current chapter unless the learner asked for it. The user must confirm the proposal; after firing the tool, end your message — do not continue teaching in the same turn. Use this tool sparingly: each proposal interrupts the flow of the lesson.

Extended thinking adds latency and should only be used when it will meaningfully improve answer quality. When in doubt, respond directly.`,
  fr: `Vous enseignez un seul chapitre … [mirror structure, second person, describe proposeSyllabusChange in French, keep latency hint at the end]`,
};
```

### 3. `app/api/journeys/[id]/chapters/[n]/chat/route.ts` — wire the new tool

Two narrow edits, matching Story 3's change:

1. Import `createProposeSyllabusChangeTool` from `@/lib/chapter-chat/tools`.
2. Extend the per-request `tools` map:

```ts
const tools = {
  updateMemory: createUpdateMemoryTool({ userId, journeyId: journey.id }),
  markChapterComplete: createMarkChapterCompleteTool(),
  proposeSyllabusChange: createProposeSyllabusChangeTool(),
};
```

No other route changes.

### 4. `lib/server/chapters/applySyllabusChange.ts` — new entity function

The transactional reconciliation. Lives alongside `complete.ts` from Story 3.

```ts
import { and, eq, inArray } from 'drizzle-orm';

import { dbTx } from '@/lib/server/db';
import { chapters, journeys } from '@/lib/server/db/schema';
import type { Syllabus } from '@/lib/server/syllabus/schema';

/** Parameters for applying a syllabus-change proposal. */
export type ApplySyllabusChangeInput = {
  /** Clerk user ID — scopes every read and write to the owner. */
  userId: string;
  /** Journey whose syllabus is being replaced. */
  journeyId: string;
  /** Full new syllabus to install. */
  newSyllabus: Syllabus;
};

/** Result of a successful syllabus-change apply. */
export type ApplySyllabusChangeResult = {
  /** The active chapter after reconciliation, with its new idx and title. */
  currentChapter: { idx: number; title: string };
};

/**
 * Replaces a journey's syllabus and reconciles its `chapters` rows.
 *
 * - Existing chapters whose id appears in the proposal are preserved.
 *   Their `id`, `status`, and `summary` survive; `idx` and `title` are
 *   updated to match the proposal.
 * - Removed `locked` chapters (id in existing, not in proposal) are deleted.
 * - Removed `done` or `active` chapters cause the call to throw — the
 *   proposal is rejected as it would destroy learner progress.
 * - Proposed chapters without an `id` are brand new and are inserted with
 *   `status = 'locked'` (a fresh nanoid is assigned by the schema default).
 * - Proposed chapters whose `id` doesn't match any existing row are
 *   rejected (the model hallucinated or stale state) — throw.
 * - `journeys.syllabus` is replaced and `currentChapterIndex` is updated
 *   to the new idx of the preserved active chapter.
 *
 * All writes run inside a single `dbTx.transaction`, gated by the parent
 * `journeys.userId`, so partial state can never be observed.
 *
 * @param input - Owner ID, journey ID, and proposed new syllabus.
 * @returns The active chapter's new idx and title after reconciliation.
 * @throws Error when the journey is not found, when no active chapter
 *   exists, when the proposal references an unknown id, or when the
 *   proposal would remove a done/active chapter.
 */
export async function applySyllabusChange({
  userId,
  journeyId,
  newSyllabus,
}: ApplySyllabusChangeInput): Promise<ApplySyllabusChangeResult> {
  return dbTx.transaction(async (tx) => {
    // 1. Ownership gate.
    const journeyRows = await tx
      .select({ id: journeys.id })
      .from(journeys)
      .where(and(eq(journeys.id, journeyId), eq(journeys.userId, userId)));
    if (journeyRows.length === 0) {
      throw new Error('Journey not found');
    }

    // 2. Load existing chapters.
    const existing = await tx
      .select({
        id: chapters.id,
        idx: chapters.idx,
        title: chapters.title,
        status: chapters.status,
      })
      .from(chapters)
      .where(eq(chapters.journeyId, journeyId))
      .orderBy(chapters.idx);

    const activeRow = existing.find((c) => c.status === 'active');
    if (activeRow === undefined) {
      throw new Error('Invalid journey state: no active chapter');
    }

    // 3. Build the id → existing-row map.
    const existingById = new Map<string, (typeof existing)[number]>();
    for (const row of existing) {
      existingById.set(row.id, row);
    }

    // 4. Resolve the reconciliation: for each proposed chapter, decide
    //    whether it maps to an existing row (preserve) or is new (insert).
    type Plan =
      | {
          kind: 'preserve';
          existingId: string;
          newIdx: number;
          newTitle: string;
        }
      | { kind: 'insert'; newIdx: number; newTitle: string };
    const plan: Plan[] = newSyllabus.chapters.map((c, i) => {
      if (c.id !== undefined) {
        const match = existingById.get(c.id);
        if (match === undefined) {
          throw new Error(`Proposal references unknown chapter id: ${c.id}`);
        }
        existingById.delete(c.id);
        return {
          kind: 'preserve',
          existingId: match.id,
          newIdx: i,
          newTitle: c.title,
        };
      }
      return { kind: 'insert', newIdx: i, newTitle: c.title };
    });

    // 5. Anything left in existingById was removed. Reject if any are
    //    done or active.
    const removed = [...existingById.values()];
    const protectedRemoved = removed.filter(
      (r) => r.status === 'done' || r.status === 'active',
    );
    if (protectedRemoved.length > 0) {
      throw new Error(
        `Proposal would remove ${protectedRemoved.length} done/active chapter(s)`,
      );
    }

    // 6. Delete locked-removed rows.
    const removedIds = removed.map((r) => r.id);
    if (removedIds.length > 0) {
      await tx.delete(chapters).where(inArray(chapters.id, removedIds));
    }

    // 7. Two-phase reindex: shift preserved rows to a negative temporary
    //    range to avoid colliding with the new positive idx values.
    const preserved = plan.filter(
      (p): p is Extract<Plan, { kind: 'preserve' }> => p.kind === 'preserve',
    );
    for (let i = 0; i < preserved.length; i++) {
      await tx
        .update(chapters)
        .set({ idx: -1 - i })
        .where(eq(chapters.id, preserved[i].existingId));
    }

    // 8. Assign final idx and (possibly) new title to each preserved row.
    for (const p of preserved) {
      await tx
        .update(chapters)
        .set({ idx: p.newIdx, title: p.newTitle })
        .where(eq(chapters.id, p.existingId));
    }

    // 9. Insert brand-new rows.
    const inserts = plan.filter(
      (p): p is Extract<Plan, { kind: 'insert' }> => p.kind === 'insert',
    );
    if (inserts.length > 0) {
      await tx.insert(chapters).values(
        inserts.map((p) => ({
          journeyId,
          idx: p.newIdx,
          title: p.newTitle,
          status: 'locked' as const,
        })),
      );
    }

    // 10. Locate the active chapter's new idx.
    const activePlan = preserved.find((p) => p.existingId === activeRow.id);
    if (activePlan === undefined) {
      // The active chapter was removed — unreachable because removing an
      // active chapter is rejected above, but TS doesn't know that.
      throw new Error('Invalid reconciliation: active chapter lost');
    }

    // 11. Update the journey: new syllabus + new currentChapterIndex.
    await tx
      .update(journeys)
      .set({
        syllabus: newSyllabus,
        currentChapterIndex: activePlan.newIdx,
      })
      .where(and(eq(journeys.id, journeyId), eq(journeys.userId, userId)));

    return {
      currentChapter: { idx: activePlan.newIdx, title: activePlan.newTitle },
    };
  });
}
```

Notes:

- The `existingById.delete` after each match prevents a malformed proposal from
  claiming the same existing row twice — if two proposed chapters carry the same
  id, the second one throws "unknown chapter id" on lookup.
- New chapter ids are generated by the
  `chapters.id.$defaultFn(() => nanoid(10))` in the schema — no explicit id
  assignment is needed in the `insert` call.
- The negative-idx shift in step 7 works because `chapters.idx` is a plain
  `integer` with no CHECK constraint.
- `journeys.updatedAt` is bumped automatically by the `$onUpdateFn` in the
  schema.

### 5. `app/[locale]/journeys/[journeySlug]/[chapterSlug]/_components/apply-syllabus-change.ts` — new server action

Co-located with the chapter page, matching Story 3's `complete-chapter.ts`.

```ts
'use server';

import { auth } from '@clerk/nextjs/server';
import { z } from 'zod';

import { applySyllabusChange } from '@/lib/server/chapters/applySyllabusChange';
import { getJourney } from '@/lib/server/journeys/get';
import { syllabusSchema } from '@/lib/server/syllabus/schema';
import { chapterPath } from '@/lib/url';

/** Input for the {@link applySyllabusChangeAction} server action. */
export type ApplySyllabusChangeInput = {
  journeyId: string;
  newSyllabus: unknown;
};

/** Result returned by {@link applySyllabusChangeAction}. */
export type ApplySyllabusChangeResult = {
  /** Canonical path of the active chapter after reconciliation. */
  chapterPath: string;
};

const inputSchema = z.object({
  journeyId: z.string().min(1),
  newSyllabus: syllabusSchema,
});

/**
 * Server action that applies a syllabus-change proposal. Validates the
 * proposed syllabus, runs the transactional reconciliation, and computes
 * the canonical path of the (possibly renamed) active chapter so the
 * client can `router.push` only when the URL actually changed.
 *
 * @param input - Journey ID and the new syllabus.
 * @returns The canonical path of the active chapter.
 * @throws Error when the caller is not authenticated, when the input is
 *   invalid, when the journey is missing, or when the proposal would
 *   destroy learner progress.
 */
export async function applySyllabusChangeAction(
  input: ApplySyllabusChangeInput,
): Promise<ApplySyllabusChangeResult> {
  const { userId } = await auth();
  if (userId === null) {
    throw new Error('Unauthorized');
  }

  const parsed = inputSchema.parse(input);

  await applySyllabusChange({
    userId,
    journeyId: parsed.journeyId,
    newSyllabus: parsed.newSyllabus,
  });

  const journey = await getJourney({ userId, id: parsed.journeyId });
  if (journey === null) {
    throw new Error('Journey not found');
  }
  const active = journey.chapters.find((c) => c.status === 'active');
  if (active === undefined) {
    throw new Error('Invalid journey state after apply');
  }

  return { chapterPath: chapterPath(journey, active) };
}
```

### 6. `app/[locale]/journeys/[journeySlug]/[chapterSlug]/_components/syllabus-diff.ts` — new pure helper

The diff matches the server reconciliation exactly: by id, not by title. The
current journey is passed in as the source of truth for existing chapters (the
JSONB syllabus may not have ids; the journey's `chapters[]` always does).

```ts
import type { Journey } from '@/lib/server/journeys/get';
import type { Syllabus } from '@/lib/server/syllabus/schema';

/** Result of comparing the current chapter set against a proposal. */
export type SyllabusDiff = {
  added: string[];
  removed: string[];
  renamed: { oldTitle: string; newTitle: string }[];
  reordered: boolean;
};

/**
 * Computes a categorical diff between the journey's current chapter set
 * (as `journey.chapters[]`, which carries stable ids) and the model's
 * proposed `newSyllabus`. Matching is by id — proposed chapters with an
 * id pair to the existing row of that id; proposed chapters without an
 * id are "added"; existing chapters whose id is missing from the
 * proposal are "removed".
 *
 * @param current - The journey, source of existing chapter ids and titles.
 * @param proposed - The model's proposed syllabus (`chapter.id` is
 *   optional; absent => new chapter).
 */
export function diffSyllabus(
  current: Journey,
  proposed: Syllabus,
): SyllabusDiff {
  const currentById = new Map(
    current.chapters.map((c) => [c.id, c.title] as const),
  );

  const added: string[] = [];
  const renamed: { oldTitle: string; newTitle: string }[] = [];
  const claimedIds = new Set<string>();

  for (const c of proposed.chapters) {
    if (c.id === undefined) {
      added.push(c.title);
      continue;
    }
    const oldTitle = currentById.get(c.id);
    if (oldTitle === undefined) {
      // Unknown id — would also be rejected by the server. Surface as
      // "added" in the UI so the user at least sees the new title.
      added.push(c.title);
      continue;
    }
    claimedIds.add(c.id);
    if (oldTitle !== c.title) {
      renamed.push({ oldTitle, newTitle: c.title });
    }
  }

  const removed = current.chapters
    .filter((c) => !claimedIds.has(c.id))
    .map((c) => c.title);

  // Reorder detection over the preserved-id sequence.
  const currentPreservedIds = current.chapters
    .map((c) => c.id)
    .filter((id) => claimedIds.has(id));
  const proposedPreservedIds = proposed.chapters
    .map((c) => c.id)
    .filter((id): id is string => id !== undefined && claimedIds.has(id));
  let reordered = false;
  for (let i = 0; i < currentPreservedIds.length; i++) {
    if (currentPreservedIds[i] !== proposedPreservedIds[i]) {
      reordered = true;
      break;
    }
  }

  return { added, removed, renamed, reordered };
}
```

### 7. `app/[locale]/journeys/[journeySlug]/[chapterSlug]/_components/syllabus-change-card.tsx` — new

The inline confirmation card. Rendered by `chapter-chat.tsx`'s `renderPart`
callback when it sees a `tool-proposeSyllabusChange` part.

```tsx
'use client';

import { useState, useTransition } from 'react';

import { Streamdown } from 'streamdown';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { useRouter } from '@/i18n/navigation';
import type { Journey } from '@/lib/server/journeys/get';
import type { Syllabus } from '@/lib/server/syllabus/schema';

import { applySyllabusChangeAction } from './apply-syllabus-change';
import { diffSyllabus, type SyllabusDiff } from './syllabus-diff';

type Props = {
  journey: Journey;
  currentPath: string;
  proposal: { reason: string; newSyllabus: Syllabus };
  dismissed: boolean;
  onDismiss: () => void;
};

export function SyllabusChangeCard({
  journey,
  currentPath,
  proposal,
  dismissed,
  onDismiss,
}: Props) {
  const t = useTranslations('ChapterChat');
  const router = useRouter();
  const [applying, startApplying] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (dismissed) {
    return (
      <div className="text-muted-foreground mt-2 text-sm italic">
        {t('proposalDismissed')}
      </div>
    );
  }

  const diff: SyllabusDiff = diffSyllabus(journey, proposal.newSyllabus);

  const handleApply = () => {
    setError(null);
    startApplying(async () => {
      try {
        const result = await applySyllabusChangeAction({
          journeyId: journey.id,
          newSyllabus: proposal.newSyllabus,
        });
        if (result.chapterPath !== currentPath) {
          router.push(result.chapterPath);
        } else {
          router.refresh();
        }
      } catch {
        setError(t('proposalApplyError'));
      }
    });
  };

  return (
    <div className="mt-3 flex flex-col gap-3 rounded border p-3">
      <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
        {t('proposalReasonHeader')}
      </p>
      <Streamdown>{proposal.reason}</Streamdown>
      <ul className="flex flex-col gap-1 text-sm">
        {diff.added.length > 0 && (
          <li>{t('proposalAdded', { titles: diff.added.join(', ') })}</li>
        )}
        {diff.removed.length > 0 && (
          <li>{t('proposalRemoved', { titles: diff.removed.join(', ') })}</li>
        )}
        {diff.renamed.map((r) => (
          <li key={r.oldTitle}>
            {t('proposalRenamed', {
              oldTitle: r.oldTitle,
              newTitle: r.newTitle,
            })}
          </li>
        ))}
        {diff.reordered && <li>{t('proposalReordered')}</li>}
      </ul>
      <div className="flex gap-2">
        <Button type="button" onClick={handleApply} disabled={applying}>
          {t('proposalApply')}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={onDismiss}
          disabled={applying}
        >
          {t('proposalDismiss')}
        </Button>
      </div>
      {error !== null && <p className="text-destructive text-sm">{error}</p>}
    </div>
  );
}
```

### 8. `app/[locale]/journeys/[journeySlug]/[chapterSlug]/_components/chapter-chat.tsx` — extend `renderPart`

Three narrow changes on top of Stories 2 and 3.

(a) Imports:

```tsx
import { useState } from 'react';

import { usePathname } from '@/i18n/navigation';
import type { Syllabus } from '@/lib/server/syllabus/schema';

import { SyllabusChangeCard } from './syllabus-change-card';
```

(b) Inside the component, add a `dismissed` set keyed by stable part-identity
(message id + part index):

```tsx
const pathname = usePathname();
const [dismissedProposals, setDismissedProposals] = useState<Set<string>>(
  () => new Set(),
);

const dismissKey = (messageId: string, index: number): string =>
  `${messageId}:${index}`;
```

(c) Extend the existing `renderPart` callback (Story 3) with a branch for
`tool-proposeSyllabusChange`. The branch reads the typed input from the tool
part once the AI SDK has parsed it.

```tsx
const renderPart = (
  part: UIMessage['parts'][number],
  {
    streaming,
    message,
    index,
  }: { message: UIMessage; streaming: boolean; index: number },
) => {
  if (part.type === 'text') {
    return (
      <MessageResponse key={index} isAnimating={streaming}>
        {part.text}
      </MessageResponse>
    );
  }
  if (part.type === 'tool-markChapterComplete') {
    // …unchanged from Story 3…
  }
  if (part.type === 'tool-proposeSyllabusChange') {
    const input = 'input' in part ? part.input : null;
    if (input === null || input === undefined) return null;
    const key = dismissKey(message.id, index);
    const proposal = input as { reason: string; newSyllabus: Syllabus };
    return (
      <SyllabusChangeCard
        key={index}
        journey={journey}
        currentPath={pathname}
        proposal={proposal}
        dismissed={dismissedProposals.has(key)}
        onDismiss={() =>
          setDismissedProposals((prev) => new Set(prev).add(key))
        }
      />
    );
  }
  return null;
};
```

The `as`-cast is the one tolerated boundary cast — AI SDK's tool-part typing for
dynamically-built tool maps doesn't fully reach across the `useChat`/`tool()`
divide. If a project-wide type predicate appears later (an `extractToolInput<T>`
for example), it should replace the cast.

### 9. `messages/en.json` + `messages/fr.json` — extend `ChapterChat`

Add seven keys under the existing `ChapterChat` namespace:

```json
"ChapterChat": {
  "promptPlaceholder": "Ask anything about this chapter…",
  "completeChapter": "Go to next chapter",
  "completeJourney": "Mark this chapter complete",
  "completeError": "Could not complete the chapter. Try again.",
  "proposalReasonHeader": "Suggested syllabus change",
  "proposalApply": "Apply",
  "proposalDismiss": "Dismiss",
  "proposalDismissed": "Dismissed",
  "proposalAdded": "Added: {titles}",
  "proposalRemoved": "Removed: {titles}",
  "proposalRenamed": "Renamed: {oldTitle} → {newTitle}",
  "proposalReordered": "Reordered chapters",
  "proposalApplyError": "Could not apply the change. Try again."
}
```

French:

```json
"ChapterChat": {
  …
  "proposalReasonHeader": "Modification proposée du programme",
  "proposalApply": "Appliquer",
  "proposalDismiss": "Ignorer",
  "proposalDismissed": "Ignoré",
  "proposalAdded": "Ajouté·s : {titles}",
  "proposalRemoved": "Supprimé·s : {titles}",
  "proposalRenamed": "Renommé : {oldTitle} → {newTitle}",
  "proposalReordered": "Chapitres réordonnés",
  "proposalApplyError": "Impossible d'appliquer la modification. Réessayez."
}
```

`messages/parity.test.ts` enforces structural equality — add the keys to both
files in the same commit.

---

## Critical files reference

- **Tool-factory pattern**: `lib/chapter-chat/tools.ts` (Stories 2 and 3).
  `createProposeSyllabusChangeTool` is a third entry following the same
  factory-with-inline-English-description shape.
- **Inline-card-in-renderPart pattern**:
  `app/[locale]/journeys/[journeySlug]/[chapterSlug]/_components/chapter-chat.tsx`
  (Story 3) — the existing `tool-markChapterComplete` branch in the `renderPart`
  callback. Story 4 adds a parallel branch.
- **Transactional entity write**: `lib/server/chapters/complete.ts` (Story 3)
  for the ownership-gate-via-parent-table pattern inside `dbTx.transaction`.
  `applySyllabusChange` extends it to multi-row updates with a re-indexing
  wrinkle (`chapters_journey_idx_unique` on `(journeyId, idx)`).
- **Server action pattern**:
  `app/[locale]/journeys/[journeySlug]/[chapterSlug]/_components/complete-chapter.ts`
  (Story 3) — auth, Zod-validate, delegate, compute navigation path.
  `applySyllabusChangeAction` is a near-clone (no `generateText`,
  reconciliation-only).
- **Schema-shape reuse**: `lib/server/syllabus/schema.ts` — `syllabusSchema` and
  `chapterSchema` are reused unchanged for the tool input and the action
  payload. No new validation shapes.
- **DB schema reference**: `lib/server/db/schema.ts` —
  `chapters_journey_idx_unique` (the `(journeyId, idx)` unique index) is the
  constraint the two-phase reindex works around. `chapters.idx` has no CHECK
  constraint, so negative-temporary-idx is safe.
- **URL helpers**: `lib/url.ts` — `chapterPath(journey, chapter)` produces the
  canonical post-apply URL. The action returns the full canonical path so the
  client can compare against `usePathname()` and decide push vs. refresh.
- **Locale-aware navigation**: `i18n/navigation.ts` — `useRouter()` and
  `usePathname()` preserve locale across `router.push` / `router.refresh`.
- **Dialog primitive availability**: `components/ui/dialog.tsx` — present but
  intentionally unused in v1; documented here so a future upgrade to a
  full-screen diff view has a clear path.

---

## Verification

Manual walkthrough in `pnpm dev`, both locales:

1. **Happy path: add a chapter (en).** Build a 2-chapter syllabus, start
   journey, land on `/en/journeys/<slug>-<id>/1-<ch1>`. Chat through chapter 1;
   steer the model toward a deep tangent ("Actually, can we spend a whole
   chapter on X?"). The model fires `proposeSyllabusChange` with a 3-chapter
   `newSyllabus`. An inline confirmation card renders inside the assistant
   message: reason paragraph in English Markdown, an "Added: X" line, two
   buttons. Click **Apply**; on success the page refreshes. Verify in
   `pnpm drizzle-kit studio`:
   - `journeys.syllabus` JSONB contains the new 3 chapters in order.
   - `chapters` rows: original chapter 1 (active) preserves its `id` at idx 0;
     the new chapter is at its proposed idx with `status='locked'`; original
     chapter 2 preserves its `id`, at its new idx, still `locked`.
   - `journeys.currentChapterIndex` matches the active chapter's new idx.
   - Sidebar `SyllabusPanel` shows the 3 chapters in the new order.
2. **Rename current chapter → URL canonicalises.** Steer the model to propose a
   rename of the current chapter (the model copies the bracketed id from the
   system prompt and changes only the title). Click Apply; the client detects
   `result.chapterPath !== currentPath` (the title-slug segment changed) and
   `router.push`es to the new URL. The URL bar, main column title, and sidebar
   reflect the new name. In studio, the row's `title` is new but its `id` is
   unchanged — confirming the rename was identified by id, not by title.
3. **Reorder existing chapters.** Steer the model to propose swapping two locked
   chapters (ids kept, array order changed). Apply. The two rows have their
   `idx` values swapped while `id`s and titles are preserved. No new rows; no
   deletions. URLs for both chapters remain valid — a bookmark to the
   now-reordered chapter resolves via id and 308-redirects to the canonical path
   with the updated `n` prefix.
4. **Remove a locked chapter.** Steer the model to propose dropping a locked
   chapter. Apply. The corresponding row is deleted; remaining rows have their
   `idx` values compacted.
5. **Defense-in-depth: reject removing a done chapter.** Mark a chapter as
   `done` in studio (or complete it through the Story 3 flow). Then hand-craft a
   proposal via devtools that drops the done chapter's id. Apply. The action
   throws; the inline error appears below the buttons; no DB writes happen. 5b.
   **Defense-in-depth: reject unknown chapter id.** Hand-craft a proposal via
   devtools that carries an `id` not present in the journey. Apply. The action
   throws "Proposal references unknown chapter id: …"; no DB writes happen.
6. **Dismiss path.** Click **Dismiss** on any proposal. The card collapses to
   "Dismissed". The chat continues normally; no DB rows change. Subsequent
   proposals are not blocked.
7. **Dismissal is session-local.** Dismiss a proposal, then refresh. Chat
   history is gone (expected — ephemeral); a fresh proposal renders without the
   dismissed state.
8. **Cross-user isolation.** As user B, call `applySyllabusChangeAction` for
   user A's journey via devtools. The action throws "Journey not found"; no
   writes happen.
9. **Auth gate.** Sign out, then call the action programmatically. Returns
   "Unauthorized"; no DB writes.
10. **Locale (fr).** Repeat steps 1, 2, and 6 on `/fr`. The model's `reason`
    field renders in French; button labels and category prefixes come from
    `messages/fr.json:ChapterChat.proposal*`. The tool description and
    system-prompt fragment stay English (project policy).
11. **Markdown reason renders correctly.** Steer the model to include a list or
    emphasis in the reason. Confirm `<Streamdown>` renders the Markdown.
12. **Idempotency / double-click.** Spam the Apply button while pending.
    `useTransition` blocks additional submissions; only one transaction runs.

Automated:

- `pnpm lint` — Prettier + ESLint clean.
- `pnpm test` — `messages/parity.test.ts` still passes after the en/fr key
  additions; `lib/url.test.ts` from Story 1 still passes.
- `pnpm build` — Next.js production build succeeds with the new
  `lib/server/chapters/applySyllabusChange.ts` and the new server action.
