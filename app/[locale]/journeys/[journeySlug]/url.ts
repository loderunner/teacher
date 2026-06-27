import { journeySlugSegment } from '@/lib/url';

/**
 * Returns the canonical path for a journey page.
 *
 * @param journey - Journey with `id` and `title`.
 * @returns A path such as `/journeys/intro-to-rust-abc1234567`.
 */
export function canonicalPath(journey: { id: string; title: string }): string {
  return `/journeys/${journeySlugSegment(journey)}`;
}
