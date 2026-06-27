import { describe, expect, it } from 'vitest';

import {
  chapterSlugSegment,
  journeySlugSegment,
  parseChapterSlug,
  parseJourneySlug,
} from './url';

describe('journeySlugSegment', () => {
  it('produces the correct segment for a simple ASCII title', () => {
    expect(
      journeySlugSegment({ id: 'abc1234567', title: 'Intro to Rust' }),
    ).toBe('intro-to-rust-abc1234567');
  });

  it('produces the correct segment for an accented French title', () => {
    expect(
      journeySlugSegment({ id: 'abc1234567', title: 'Démarrage rapide' }),
    ).toBe('demarrage-rapide-abc1234567');
  });

  it('collapses multiple spaces into a single dash', () => {
    expect(journeySlugSegment({ id: 'abc1234567', title: 'Hello   World' })).toBe(
      'hello-world-abc1234567',
    );
  });

  it('truncates slugs longer than 80 characters', () => {
    const segment = journeySlugSegment({ id: 'abc1234567', title: 'A'.repeat(100) });
    const slugPart = segment.slice(0, -'-abc1234567'.length);
    expect(slugPart.length).toBeLessThanOrEqual(80);
  });

  it('falls back to "journey" when title is an empty string', () => {
    expect(journeySlugSegment({ id: 'abc1234567', title: '' })).toBe(
      'journey-abc1234567',
    );
  });

  it('replaces special characters with dashes', () => {
    expect(journeySlugSegment({ id: 'abc1234567', title: 'C++ & Rust!' })).toBe(
      'c-rust-abc1234567',
    );
  });

  it('strips leading and trailing dashes from the slug part', () => {
    expect(journeySlugSegment({ id: 'abc1234567', title: '---hello---' })).toBe(
      'hello-abc1234567',
    );
  });
});

describe('chapterSlugSegment', () => {
  it('produces the correct segment', () => {
    const chapter = { id: 'cid1234567', idx: 2, title: 'Borrowing' };
    expect(chapterSlugSegment(chapter)).toBe('3-borrowing-cid1234567');
  });

  it('uses 1-based chapter number', () => {
    const chapter = { id: 'cid1234567', idx: 4, title: 'Advanced Topics' };
    expect(chapterSlugSegment(chapter)).toMatch(/^5-advanced-topics-/);
  });
});

describe('parseJourneySlug', () => {
  it('parses a valid journey slug', () => {
    expect(parseJourneySlug('intro-to-rust-abc1234567')).toEqual({
      id: 'abc1234567',
      slugPart: 'intro-to-rust',
    });
  });

  it('returns null when the separator is missing', () => {
    expect(parseJourneySlug('nohyphenabc1234567')).toBeNull();
  });

  it('returns null for a segment that is too short', () => {
    expect(parseJourneySlug('short')).toBeNull();
    expect(parseJourneySlug('')).toBeNull();
  });

  it('handles a segment that is exactly 11 characters with a dash at position 0', () => {
    const result = parseJourneySlug('-abc1234567');
    expect(result).toEqual({ id: 'abc1234567', slugPart: '' });
  });

  it('accepts a bare 10-character nanoid with no slug prefix', () => {
    expect(parseJourneySlug('VVef8d10Tb')).toEqual({
      id: 'VVef8d10Tb',
      slugPart: '',
    });
  });
});

describe('journeySlugSegment and parseJourneySlug round-trip', () => {
  it('recovers id and slug part from a simple ASCII title', () => {
    const id = 'abc1234567';
    const title = 'Intro to Rust';
    const segment = journeySlugSegment({ id, title });
    expect(parseJourneySlug(segment)).toEqual({
      id,
      slugPart: 'intro-to-rust',
    });
  });

  it('recovers id and slug part from an accented French title', () => {
    const id = 'abc1234567';
    const title = 'Démarrage rapide';
    const segment = journeySlugSegment({ id, title });
    expect(parseJourneySlug(segment)).toEqual({
      id,
      slugPart: 'demarrage-rapide',
    });
  });
});

describe('parseChapterSlug', () => {
  it('parses a valid chapter slug', () => {
    expect(parseChapterSlug('1-installing-python-abc123def4')).toEqual({
      n: 1,
      slugPart: 'installing-python',
      id: 'abc123def4',
    });
  });

  it('returns null when segment is too short', () => {
    expect(parseChapterSlug('foo-bar')).toBeNull();
  });

  it('returns null when n is zero', () => {
    expect(parseChapterSlug('0-installing-python-abc123def4')).toBeNull();
  });

  it('returns null when separator before id is missing', () => {
    expect(parseChapterSlug('1-installing-pythonabc123def4')).toBeNull();
  });

  it('returns null when head has no numeric prefix', () => {
    expect(parseChapterSlug('abc-installing-python-abc123def4')).toBeNull();
  });

  it('accepts a bare "<n>-<id>" segment with no title slug', () => {
    expect(parseChapterSlug('3-VVef8d10Tb')).toEqual({
      n: 3,
      slugPart: '',
      id: 'VVef8d10Tb',
    });
  });

  it('accepts a bare 10-character nanoid with no number prefix or slug', () => {
    expect(parseChapterSlug('VVef8d10Tb')).toEqual({
      slugPart: '',
      id: 'VVef8d10Tb',
    });
  });
});

describe('chapterSlugSegment and parseChapterSlug round-trip', () => {
  it('recovers n, slug part, and id', () => {
    const chapter = { id: 'cid1234567', idx: 0, title: 'Installing Python' };
    expect(parseChapterSlug(chapterSlugSegment(chapter))).toEqual({
      n: 1,
      slugPart: 'installing-python',
      id: 'cid1234567',
    });
  });

  it('recovers from an accented French title', () => {
    const chapter = { id: 'abc123def4', idx: 1, title: 'Démarrage rapide' };
    expect(parseChapterSlug(chapterSlugSegment(chapter))).toEqual({
      n: 2,
      slugPart: 'demarrage-rapide',
      id: 'abc123def4',
    });
  });
});
