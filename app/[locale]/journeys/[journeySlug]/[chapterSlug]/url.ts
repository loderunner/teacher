import { chapterSlugSegment, journeySlugSegment } from '@/lib/url';

/**
 * Returns the canonical path for a chapter page.
 *
 * @param journey - Journey with `id` and `title`.
 * @param chapter - Chapter with `id`, `idx` (0-based), and `title`.
 * @returns A path such as `/journeys/intro-to-rust-abc1234567/1-variables-xyz9876543`.
 */
export function canonicalPath(
  journey: { id: string; title: string },
  chapter: { id: string; idx: number; title: string },
): string {
  return `/journeys/${journeySlugSegment(journey)}/${chapterSlugSegment(chapter)}`;
}
