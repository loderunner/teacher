/** The decoded parts of a journey URL segment. */
export type ParsedSlug = {
  /** The 10-character nanoid of the journey. */
  id: string;
  /** The human-readable slug portion (without the trailing `-<id>`). */
  slugPart?: string;
};

/** The decoded parts of a chapter URL segment. */
export type ParsedChapterSlug = {
  /** The 10-character nanoid of the chapter. */
  id: string;
  /** 1-based chapter number (human-readable prefix). Absent for bare-ID segments. */
  n?: number;
  /** The human-readable slug portion between the number and the id. */
  slugPart?: string;
};

/**
 * Normalizes text into a URL-safe slug.
 *
 * @param text - Raw text to slugify.
 * @returns A lowercase, hyphen-separated, diacritic-free slug.
 */
export function slugify(text: string): string {
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
 * Returns the URL segment for a journey (without the `/journeys/` prefix).
 *
 * @param id - The journey's 10-character nanoid.
 * @param title - The journey title, used to build the human-readable slug.
 * @returns A segment such as `"intro-to-rust-abc1234567"`.
 */
export function journeySlugSegment(journey: {
  id: string;
  title: string;
}): string {
  return `${slugify(journey.title)}-${journey.id}`;
}

/**
 * Parses a journey URL segment into its ID and slug parts.
 *
 * The last 10 characters are always treated as the ID. Everything before is
 * the slug part, with the separator dash at position -11 stripped when present.
 * Returns `null` only when the segment is shorter than 10 characters.
 *
 * @param seg - The raw URL segment, e.g. `"intro-to-rust-abc1234567"`.
 * @returns The parsed slug, or `null` if the segment is too short.
 */
export function parseJourneySlug(seg: string): ParsedSlug | null {
  // Too short to be a valid journey slug - not even a nanoid
  if (seg.length < 10) {
    return null;
  }
  // The last 10 characters are always the nanoid
  const id = seg.slice(-10);
  // If the segment is exactly 10 characters long, it's a bare nanoid - no slug\
  // part
  if (seg.length === 10) {
    return { id };
  }
  // If the segment has a separator dash at position -11, the slug part is
  // everything before it
  if (seg[seg.length - 11] === '-') {
    return { id, slugPart: seg.slice(0, -11) };
  }
  // Otherwise, the slug part is invalid
  return { id };
}

/**
 * Returns the URL segment for a chapter (the chapter-level part only,
 * without the journey prefix).
 *
 * @param chapter - Chapter with `id`, `idx` (0-based), and `title`.
 * @returns A segment such as `"1-variables-xyz9876543"`.
 */
export function chapterSlugSegment(chapter: {
  id: string;
  idx: number;
  title: string;
}): string {
  return `${chapter.idx + 1}-${slugify(chapter.title)}-${chapter.id}`;
}

/**
 * Parses a chapter URL segment into its number, slug, and ID parts.
 *
 * The last 10 characters are always treated as the ID. Everything before is
 * parsed loosely: the separator dash at position -11 is stripped when present,
 * and a leading numeric prefix becomes `n`. Returns `null` only when the
 * segment is shorter than 10 characters.
 *
 * @param seg - The raw URL segment, e.g. `"1-installing-python-abc123def4"`.
 * @returns The parsed chapter slug, or `null` if the segment is too short.
 *
 * @example
 * parseChapterSlug('1-installing-python-abc123def4')
 * // → { n: 1, slugPart: 'installing-python', id: 'abc123def4' }
 */
export function parseChapterSlug(seg: string): ParsedChapterSlug | null {
  // Too short to be a valid chapter slug - not even a nanoid
  if (seg.length < 10) {
    return null;
  }
  // The last 10 characters are always the nanoid
  const id = seg.slice(-10);
  // If the segment is exactly 10 characters long, it's a bare nanoid
  if (seg.length === 10) {
    return { id };
  }

  // The rest of the segment should match the pattern "<n>-<slug>-<id>"
  const rest = seg.slice(0, -10);
  const match = rest.match(/^(\d+)-([^-]+)-$/);
  if (match === null) {
    return { id };
  }
  const [, n, slugPart] = match;
  return { n: Number(n), slugPart, id };
}

/**
 * Returns the canonical URL path for a journey.
 *
 * @param journey - Journey with `id` and `title`.
 * @returns A path such as `"/journeys/intro-to-rust-abc1234567"`.
 */
export function journeyPath(journey: { id: string; title: string }): string {
  return `/journeys/${journeySlugSegment(journey)}`;
}

/**
 * Returns the canonical URL path for a journey's syllabus chat.
 *
 * @param journey - Journey with `id` and `title`.
 * @returns A path such as `"/journeys/intro-to-rust-abc1234567/syllabus"`.
 */
export function syllabusPath(journey: { id: string; title: string }): string {
  return `${journeyPath(journey)}/syllabus`;
}

/**
 * Returns the canonical URL path for a chapter.
 *
 * @param journey - Journey with `id` and `title`.
 * @param chapter - Chapter with `id`, `idx` (0-based), and `title`.
 * @returns A path such as `"/journeys/intro-to-rust-abc1234567/1-variables-xyz9876543"`.
 */
export function chapterPath(
  journey: { id: string; title: string },
  chapter: { id: string; idx: number; title: string },
): string {
  return `${journeyPath(journey)}/${chapterSlugSegment(chapter)}`;
}
