import { and, desc, eq, lt, or, sql } from 'drizzle-orm';

import { db } from '@/lib/server/db';
import { journeys } from '@/lib/server/db/schema';

/** A lightweight journey summary returned from a list query. */
export type JourneySummary = {
  /** Unique journey ID. */
  id: string;
  /** Display title of the journey. */
  title: string;
  /** Teaching style preset ID, e.g. `"teacher"`. */
  styleId: string;
  /** Lifecycle state — drafting journeys have not yet been activated. */
  status: 'drafting' | 'active';
  /** Number of chapters in the syllabus. */
  chapterCount: number;
  /** Timestamp of the last update. */
  updatedAt: Date;
};

/** Parameters for listing journeys. */
export type ListJourneysParams = {
  /** Clerk user ID — results are scoped to this user. */
  userId: string;
  /** Maximum number of rows to return. */
  limit: number;
  /**
   * `updatedAt` of the last item on the previous page.
   * Provide together with {@link id} to resume after a page break.
   */
  updatedAt?: Date;
  /**
   * `id` of the last item on the previous page.
   * Provide together with {@link updatedAt} to resume after a page break.
   */
  id?: string;
};

/**
 * Returns a page of journeys for a user, most recently updated first.
 *
 * Fetch `limit + 1` rows to determine whether more pages exist: if the result
 * length exceeds `limit`, there is a next page. Pass the last kept item's
 * `updatedAt` and `id` to `encodePageToken` to produce the `nextPageToken`
 * for the response.
 *
 * @param params - The user, page size, and optional decoded page cursor.
 * @returns An array of journey summaries, ordered by `updatedAt DESC, id DESC`.
 */
export async function listJourneys({
  userId,
  limit,
  updatedAt,
  id,
}: ListJourneysParams): Promise<JourneySummary[]> {
  return db
    .select({
      id: journeys.id,
      title: journeys.title,
      styleId: journeys.styleId,
      status: journeys.status,
      chapterCount: sql<number>`jsonb_array_length(${journeys.syllabus}->'chapters')`,
      updatedAt: journeys.updatedAt,
    })
    .from(journeys)
    .where(
      updatedAt !== undefined && id !== undefined
        ? and(
            eq(journeys.userId, userId),
            or(
              lt(journeys.updatedAt, updatedAt),
              and(eq(journeys.updatedAt, updatedAt), lt(journeys.id, id)),
            ),
          )
        : eq(journeys.userId, userId),
    )
    .orderBy(desc(journeys.updatedAt), desc(journeys.id))
    .limit(limit);
}
