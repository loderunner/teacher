export type ParsedSlug = { id: string; slugPart: string };

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

export function journeyPath(id: string, title: string): string {
  return `/journeys/${slugify(title)}-${id}`;
}

export function parseJourneySlug(seg: string): ParsedSlug | null {
  // segment is "<slug>-<10-char-nanoid>", separator is the char at position -11
  if (seg.length < 11 || seg[seg.length - 11] !== '-') {
    return null;
  }
  const id = seg.slice(seg.length - 10);
  return { id, slugPart: seg.slice(0, seg.length - 11) };
}
