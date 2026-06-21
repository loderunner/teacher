import { z } from 'zod';

/** Zod schema for a single journey summary as returned by the journeys API. */
export const journeySummarySchema = z.object({
  id: z.string(),
  title: z.string(),
  styleId: z.string(),
  status: z.enum(['drafting', 'active']),
  chapterCount: z.number().int().nonnegative(),
  updatedAt: z.coerce.date(),
});

/** Zod schema for a paginated journeys API response. */
export const listJourneysResponseSchema = z.object({
  items: z.array(journeySummarySchema),
  nextPageToken: z.string().optional(),
});

/** Paginated response from the journeys list endpoint. */
export type ListJourneysResponse = z.infer<typeof listJourneysResponseSchema>;
