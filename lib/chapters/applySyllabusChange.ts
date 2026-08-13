import { and, eq, inArray } from 'drizzle-orm';

import { dbTx } from '@/lib/db';
import { chapters, journeys } from '@/lib/db/schema';
import { type JourneyChapterStatus } from '@/lib/journeys/get';
import type { Syllabus } from '@/lib/syllabus/schema';

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
 * Reconciles a journey's `chapters` rows against a proposed syllabus.
 *
 * The `chapters` rows are the sole source of truth for an active journey's
 * content, so this function only ever writes rows — `journeys.syllabusDraft`
 * is left exactly as activation froze it.
 *
 * - Existing chapters whose id appears in the proposal are preserved. Their
 *   `id`, `status`, and `summary` always survive.
 * - `done` chapters are fully immutable: the proposal may move them to a new
 *   position, but any change to their `title`, `overview`, or `sections` is
 *   rejected — throw.
 * - The `active` chapter may be renamed and moved, but changes to its
 *   `overview` or `sections` are rejected — throw. This protects the content
 *   the learner is currently being taught from a model reconstructing it
 *   imperfectly.
 * - `locked` chapters carry no learner progress, so their `title`,
 *   `overview`, and `sections` are replaced wholesale from the proposal.
 * - Removed `locked` chapters (id in existing, not in proposal) are deleted.
 * - Removed `done` or `active` chapters cause the call to throw — the
 *   proposal is rejected as it would destroy learner progress.
 * - Proposed chapters without an `id` are brand new and are inserted with
 *   `status = 'locked'` (a fresh nanoid is assigned by the schema default).
 * - Proposed chapters whose `id` doesn't match any existing row are
 *   rejected — throw.
 * - `currentChapterIndex` is updated to the new idx of the preserved active
 *   chapter.
 *
 * All writes run inside a single `dbTx.transaction`, gated by the parent
 * `journeys.userId`, so partial state can never be observed.
 *
 * @param input - Owner ID, journey ID, and proposed new syllabus.
 * @returns The active chapter's new idx and title after reconciliation.
 * @throws Error when the journey is not found, when no active chapter
 *   exists, when the proposal references an unknown id, when the proposal
 *   would remove a done/active chapter, or when it would alter protected
 *   done/active chapter content.
 */
export async function applySyllabusChange({
  userId,
  journeyId,
  newSyllabus,
}: ApplySyllabusChangeInput): Promise<ApplySyllabusChangeResult> {
  return dbTx.transaction(async (tx) => {
    // Phase 1: Confirm the journey exists and belongs to this user.
    const journeyRows = await tx
      .select({ id: journeys.id })
      .from(journeys)
      .where(and(eq(journeys.id, journeyId), eq(journeys.userId, userId)));
    if (journeyRows.length === 0) {
      throw new Error('Journey not found');
    }

    // Phase 2: Load every chapter row for the journey, in syllabus order.
    const existing = await tx
      .select({
        id: chapters.id,
        idx: chapters.idx,
        title: chapters.title,
        status: chapters.status,
        overview: chapters.overview,
        sections: chapters.sections,
      })
      .from(chapters)
      .where(eq(chapters.journeyId, journeyId))
      .orderBy(chapters.idx);

    // Phase 3: Require an active chapter (anchor for progression rules) and
    // build an id → row map so proposal ids can be matched to the DB.
    const activeRow = existing.find((c) => c.status === 'active');
    if (activeRow === undefined) {
      throw new Error('Invalid journey state: no active chapter');
    }

    const existingById = new Map<string, (typeof existing)[number]>();
    for (const row of existing) {
      existingById.set(row.id, row);
    }

    // Rows the proposal has not claimed yet. Phase 4 removes each id it
    // matches, so whatever is left over was dropped from the syllabus.
    const unmatchedById = new Map(existingById);

    // Phase 4: Walk the proposed syllabus — each entry becomes either a
    // preserve (known id) or an insert (no id); unknown ids abort.
    type Plan =
      | {
          kind: 'preserve';
          existingId: string;
          existingStatus: JourneyChapterStatus;
          newIdx: number;
          newTitle: string;
          newOverview: string;
          newSections: string[];
        }
      | {
          kind: 'insert';
          newIdx: number;
          newTitle: string;
          newOverview: string;
          newSections: string[];
        };

    const plan: Plan[] = newSyllabus.chapters.map((c, i) => {
      if (c.id !== undefined) {
        const match = existingById.get(c.id);
        if (match === undefined) {
          throw new Error(`Proposal references unknown chapter id: ${c.id}`);
        }
        unmatchedById.delete(c.id);
        return {
          kind: 'preserve' as const,
          existingId: match.id,
          existingStatus: match.status,
          newIdx: i,
          newTitle: c.title,
          newOverview: c.overview,
          newSections: c.sections,
        };
      }
      return {
        kind: 'insert' as const,
        newIdx: i,
        newTitle: c.title,
        newOverview: c.overview,
        newSections: c.sections,
      };
    });

    // Phase 5: Chapters present in the DB but not in the proposal are
    // "removed"; refuse if any of them are done or active (learner progress).
    const removed = [...unmatchedById.values()];
    const protectedRemoved = removed.filter(
      (r) => r.status === 'done' || r.status === 'active',
    );
    if (protectedRemoved.length > 0) {
      throw new Error(
        `Proposal would remove ${protectedRemoved.length} done/active chapter(s)`,
      );
    }

    // Phase 6: Resolve where the active chapter lands in the new ordering and
    // forbid inserting new chapters before it (would violate linear progress).
    const activePlan = plan.find(
      (p): p is Extract<Plan, { kind: 'preserve' }> =>
        p.kind === 'preserve' && p.existingId === activeRow.id,
    );
    if (activePlan === undefined) {
      // Unreachable: the active chapter can't have been removed (caught
      // above). TS can't prove it, so the guard is still needed.
      throw new Error('Invalid reconciliation: active chapter lost');
    }

    // Inserting a locked chapter before the active chapter breaks the linear
    // progression model — the learner has already moved past that position.
    const insertBeforeActive = plan.some(
      (p): p is Extract<Plan, { kind: 'insert' }> =>
        p.kind === 'insert' && p.newIdx < activePlan.newIdx,
    );
    if (insertBeforeActive) {
      throw new Error(
        'Proposal would insert new chapters before the active chapter',
      );
    }

    // Phase 6.5: Protect the content the learner has already reached. A
    // proposal is a model's reconstruction of the syllabus, so letting it
    // write back over a done or active chapter silently destroys real content
    // whenever that reconstruction is imperfect. Reject instead of applying.
    const preserved = plan.filter(
      (p): p is Extract<Plan, { kind: 'preserve' }> => p.kind === 'preserve',
    );

    const sameSections = (a: string[], b: string[]): boolean =>
      a.length === b.length && a.every((s, i) => s === b[i]);

    for (const p of preserved) {
      const row = existingById.get(p.existingId);
      if (row === undefined) {
        // Unreachable: every preserve entry was matched against this map in
        // Phase 4. TS can't prove it, so the guard is still needed.
        throw new Error('Invalid reconciliation: preserved chapter lost');
      }
      const contentChanged =
        p.newOverview !== row.overview ||
        !sameSections(p.newSections, row.sections);

      // Done chapters are immutable beyond their position: their title and
      // content were the context under which the retrospective summary was
      // generated, so changing either post-completion breaks that link.
      if (
        row.status === 'done' &&
        (contentChanged || p.newTitle !== row.title)
      ) {
        throw new Error(`Proposal modifies done chapter "${row.title}"`);
      }

      // The learner is mid-chapter: renaming is harmless, but rewriting what
      // the chapter covers would change the lesson out from under them.
      if (row.status === 'active' && contentChanged) {
        throw new Error(
          "Proposal modifies the active chapter's overview or sections",
        );
      }
    }

    // Phase 7: Delete chapters that vanished from the proposal — at this point
    // only locked rows remain (done/active removals already rejected).
    const removedIds = removed.map((r) => r.id);
    if (removedIds.length > 0) {
      await tx.delete(chapters).where(inArray(chapters.id, removedIds));
    }

    // Phase 8: Move preserved rows to their final indices in two steps (first
    // negative placeholders, then real idx/title) so intermediate states never
    // violate chapters_journey_idx_unique on (journeyId, idx).
    for (let i = 0; i < preserved.length; i++) {
      await tx
        .update(chapters)
        .set({ idx: -1 - i })
        .where(eq(chapters.id, preserved[i].existingId));
    }

    // Which columns a preserved row accepts, by what its status protects.
    // Phase 6.5 already verified that done/active content matches the
    // proposal, so those rows are never rewritten — only repositioned.
    const updatedFields = (p: Extract<Plan, { kind: 'preserve' }>) => {
      switch (p.existingStatus) {
        case 'done':
          return { idx: p.newIdx };
        case 'active':
          return { idx: p.newIdx, title: p.newTitle };
        case 'locked':
          return {
            idx: p.newIdx,
            title: p.newTitle,
            overview: p.newOverview,
            sections: p.newSections,
          };
      }
    };

    for (const p of preserved) {
      await tx
        .update(chapters)
        .set(updatedFields(p))
        .where(eq(chapters.id, p.existingId));
    }

    // Phase 9: Append net-new proposal chapters as fresh locked rows.
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
          overview: p.newOverview,
          sections: p.newSections,
        })),
      );
    }

    // Phase 10: Point the journey at the active chapter's new index. The
    // syllabus draft is deliberately left untouched — the rows above are the
    // source of truth, and rewriting a blob from a proposal is exactly the
    // drift this reconciliation exists to prevent.
    await tx
      .update(journeys)
      .set({ currentChapterIndex: activePlan.newIdx })
      .where(and(eq(journeys.id, journeyId), eq(journeys.userId, userId)));

    return {
      currentChapter: { idx: activePlan.newIdx, title: activePlan.newTitle },
    };
  });
}
