import type { Journey } from '@/lib/journeys/get';
import type { Syllabus } from '@/lib/syllabus/schema';

/** Result of comparing the current chapter set against a proposal. */
export type SyllabusDiff = {
  /** Titles of chapters that would be added. */
  added: string[];
  /** Titles of chapters that would be removed. */
  removed: string[];
  /** Chapters that would be renamed, with old and new titles. */
  renamed: { oldTitle: string; newTitle: string }[];
  /** Whether the preserved chapters would be reordered. */
  reordered: boolean;
};

/**
 * Computes a categorical diff between the journey's current chapter set
 * and a proposed new syllabus. Matching is by id — proposed chapters with
 * an id pair to the existing row of that id; proposed chapters without an
 * id are "added"; existing chapters whose id is missing from the proposal
 * are "removed".
 *
 * @param current - The journey, source of existing chapter ids and titles.
 * @param proposed - The model's proposed syllabus (`chapter.id` is
 *   optional; absent means a new chapter).
 * @returns A categorical diff with added, removed, renamed, and reordered.
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
      // Unknown id — would also be rejected by the server. Surface as "added"
      // so the user at least sees the proposed title.
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
