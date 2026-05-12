/** The decoded parts of a journey URL segment. */
export type ParsedSlug = {
  /** The 10-character nanoid of the journey. */
  id: string;
  /** The human-readable slug portion (without the trailing `-<id>`). */
  slugPart: string;
};

function slugify(text: string): string {
  const slug = text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // strip combining diacritical marks
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);

  return slug.length > 0 ? slug : 'journey';
}

/**
 * Returns the URL path for a journey page.
 *
 * @param id - The journey's 10-character nanoid.
 * @param title - The journey title, used to build the human-readable slug.
 * @returns A path such as `/journeys/intro-to-rust-abc1234567`.
 */
export function journeyPath(id: string, title: string): string {
  return `/journeys/${slugify(title)}-${id}`;
}

/**
 * Parses a journey URL segment into its ID and slug parts.
 *
 * @param seg - The raw URL segment, e.g. `"intro-to-rust-abc1234567"`.
 * @returns The parsed slug, or `null` if the segment format is invalid.
 */
export function parseJourneySlug(seg: string): ParsedSlug | null {
  // segment is "<slug>-<10-char-nanoid>", separator is the char at position -11
  if (seg.length < 11 || seg[seg.length - 11] !== '-') {
    return null;
  }
  const id = seg.slice(seg.length - 10);
  return { id, slugPart: seg.slice(0, seg.length - 11) };
}
