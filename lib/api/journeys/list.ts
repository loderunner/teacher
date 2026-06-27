import { z } from 'zod';

/**
 * Summary of a journey as returned by `GET /api/journeys`.
 */
export type JourneySummary = {
  /** Unique journey identifier. */
  id: string;
  /** Display title of the journey. */
  title: string;
  /** Teaching style preset ID, e.g. `"teacher"`. */
  styleId: string;
  /** Lifecycle state — drafting journeys have not yet been activated. */
  status: 'drafting' | 'active';
  /** Number of chapters in the syllabus. */
  chapterCount: number;
  /**
   * 1-based index of the current chapter. `null` for drafting journeys that
   * have not yet been activated.
   */
  currentChapterNumber: number | null;
  /** Timestamp of the last update. */
  updatedAt: Date;
};

/** Zod schema for {@link JourneySummary}. */
export const journeySummarySchema: z.ZodType<JourneySummary> = z.strictObject({
  id: z.string().describe('Unique journey identifier.'),
  title: z.string().describe('Display title of the journey.'),
  styleId: z.string().describe('Teaching style preset ID, e.g. "teacher".'),
  status: z
    .enum(['drafting', 'active'])
    .describe(
      'Lifecycle state — drafting journeys have not yet been activated.',
    ),
  chapterCount: z
    .number()
    .int()
    .nonnegative()
    .describe('Number of chapters in the syllabus.'),
  currentChapterNumber: z
    .number()
    .int()
    .positive()
    .nullable()
    .describe(
      '1-based index of the current chapter. null for drafting journeys.',
    ),
  updatedAt: z.coerce.date().describe('Timestamp of the last update.'),
});

/**
 * Paginated response from `GET /api/journeys`.
 */
export type ListJourneysResponse = {
  /** The current page of journey summaries. */
  items: JourneySummary[];
  /** Opaque token for the next page. Absent when this is the last page. */
  nextPageToken?: string;
};

/** Zod schema for {@link ListJourneysResponse}. */
export const listJourneysResponseSchema: z.ZodType<ListJourneysResponse> =
  z.strictObject({
    items: z
      .array(journeySummarySchema)
      .describe('The current page of journey summaries.'),
    nextPageToken: z
      .string()
      .optional()
      .describe(
        'Opaque token for the next page. Absent when this is the last page.',
      ),
  });
