/** The decoded parts of a journey URL segment. */
export type ParsedSlug = {
  /** The 10-character nanoid of the journey. */
  id: string;
  /** The human-readable slug portion (without the trailing `-<id>`). */
  slugPart: string;
};

/** The decoded parts of a chapter URL segment. */
export type ParsedChapterSlug = {
  /** The 10-character nanoid of the chapter. */
  id: string;
  /** 1-based chapter number (human-readable prefix). Absent for bare-ID segments. */
  n?: number;
  /** The human-readable slug portion between the number and the id. */
  slugPart: string;
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
 * @param seg - The raw URL segment, e.g. `"intro-to-rust-abc1234567"`.
 * @returns The parsed slug, or `null` if the segment format is invalid.
 */
export function parseJourneySlug(seg: string): ParsedSlug | null {
  // bare 10-char nanoid with no slug prefix
  if (seg.length === 10) {
    return { id: seg, slugPart: '' };
  }
  // segment is "<slug>-<10-char-nanoid>", separator is the char at position -11
  if (seg.length < 11 || seg[seg.length - 11] !== '-') {
    return null;
  }
  const id = seg.slice(seg.length - 10);
  return { id, slugPart: seg.slice(0, seg.length - 11) };
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
 * Expected format: `<n>-<title-slug>-<10-char-nanoid>`.
 * The separator before the ID is fixed at position -11.
 *
 * @param seg - The raw URL segment, e.g. `"1-installing-python-abc123def4"`.
 * @returns The parsed chapter slug, or `null` if the format is invalid.
 *
 * @example
 * parseChapterSlug('1-installing-python-abc123def4')
 * // → { n: 1, slugPart: 'installing-python', id: 'abc123def4' }
 */
export function parseChapterSlug(seg: string): ParsedChapterSlug | null {
  // bare 10-char nanoid with no number prefix or slug
  if (seg.length === 10) {
    return { slugPart: '', id: seg };
  }
  // shape: <n>-<title-slug>-<10-char-nanoid>; separator before id is at -11
  if (seg.length < 12 || seg[seg.length - 11] !== '-') {
    return null;
  }
  const id = seg.slice(-10);
  const head = seg.slice(0, -11);
  // bare "<n>-<id>" with no title slug — head is just the number
  const bareMatch = head.match(/^(\d+)$/);
  if (bareMatch !== null) {
    const n = Number(bareMatch[1]);
    if (!Number.isInteger(n) || n < 1) {
      return null;
    }
    return { n, slugPart: '', id };
  }
  const match = head.match(/^(\d+)-(.*)$/);
  if (match === null) {
    return null;
  }
  const n = Number(match[1]);
  if (!Number.isInteger(n) || n < 1) {
    return null;
  }
  return { n, slugPart: match[2], id };
}
