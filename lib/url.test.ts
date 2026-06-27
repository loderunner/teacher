import { describe, expect, it } from 'vitest';

import {
  chapterPath,
  chapterSlugSegment,
  journeyPath,
  journeySlugSegment,
  parseChapterSlug,
  parseJourneySlug,
} from './url';

describe('journeyPath', () => {
  it('builds a path for a simple ASCII title', () => {
    expect(journeyPath('abc1234567', 'Intro to Rust')).toBe(
      '/journeys/intro-to-rust-abc1234567',
    );
  });

  it('builds a path for an accented French title', () => {
    expect(journeyPath('abc1234567', 'Démarrage rapide')).toBe(
      '/journeys/demarrage-rapide-abc1234567',
    );
  });

  it('collapses multiple spaces into a single dash', () => {
    expect(journeyPath('abc1234567', 'Hello   World')).toBe(
      '/journeys/hello-world-abc1234567',
    );
  });

  it('truncates slugs longer than 80 characters', () => {
    const longTitle = 'A'.repeat(100);
    const result = journeyPath('abc1234567', longTitle);
    const slug = result.slice('/journeys/'.length, -'-abc1234567'.length);
    expect(slug.length).toBeLessThanOrEqual(80);
  });

  it('falls back to "journey" when title is an empty string', () => {
    expect(journeyPath('abc1234567', '')).toBe('/journeys/journey-abc1234567');
  });

  it('replaces special characters with dashes', () => {
    expect(journeyPath('abc1234567', 'C++ & Rust!')).toBe(
      '/journeys/c-rust-abc1234567',
    );
  });

  it('strips leading and trailing dashes from the slug', () => {
    expect(journeyPath('abc1234567', '---hello---')).toBe(
      '/journeys/hello-abc1234567',
    );
  });
});

describe('journeySlugSegment', () => {
  it('returns the segment that journeyPath appends after /journeys/', () => {
    const id = 'abc1234567';
    const title = 'Intro to Rust';
    expect(journeyPath(id, title)).toBe(
      `/journeys/${journeySlugSegment(id, title)}`,
    );
  });

  it('produces a segment matching the journeyPath output', () => {
    expect(journeySlugSegment('abc1234567', 'Intro to Rust')).toBe(
      'intro-to-rust-abc1234567',
    );
  });
});

describe('chapterSlugSegment', () => {
  it('returns the chapter segment that chapterPath appends after the journey path', () => {
    const journey = { id: 'jid1234567', title: 'Intro to Rust' };
    const chapter = { id: 'cid1234567', idx: 0, title: 'Installing Python' };
    const full = chapterPath(journey, chapter);
    const journeyPrefix = journeyPath(journey.id, journey.title);
    expect(full).toBe(`${journeyPrefix}/${chapterSlugSegment(chapter)}`);
  });

  it('produces the correct segment', () => {
    const chapter = { id: 'cid1234567', idx: 2, title: 'Borrowing' };
    expect(chapterSlugSegment(chapter)).toBe('3-borrowing-cid1234567');
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

describe('journeyPath and parseJourneySlug round-trip', () => {
  it('recovers id and slug part from a simple ASCII title', () => {
    const id = 'abc1234567';
    const title = 'Intro to Rust';
    const segment = journeyPath(id, title).replace(/^\/journeys\//, '');
    expect(parseJourneySlug(segment)).toEqual({
      id,
      slugPart: 'intro-to-rust',
    });
  });

  it('recovers id and slug part from an accented French title', () => {
    const id = 'abc1234567';
    const title = 'Démarrage rapide';
    const segment = journeyPath(id, title).replace(/^\/journeys\//, '');
    expect(parseJourneySlug(segment)).toEqual({
      id,
      slugPart: 'demarrage-rapide',
    });
  });
});

describe('chapterPath', () => {
  it('produces the correct path shape', () => {
    const journey = { id: 'jid1234567', title: 'Intro to Rust' };
    const chapter = { id: 'cid1234567', idx: 0, title: 'Installing Python' };
    expect(chapterPath(journey, chapter)).toBe(
      '/journeys/intro-to-rust-jid1234567/1-installing-python-cid1234567',
    );
  });

  it('uses 1-based chapter number in URL', () => {
    const journey = { id: 'jid1234567', title: 'Journey' };
    const chapter = { id: 'cid1234567', idx: 4, title: 'Advanced Topics' };
    expect(chapterPath(journey, chapter)).toMatch(/\/5-advanced-topics-/);
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

describe('chapterPath and parseChapterSlug round-trip', () => {
  it('recovers n, slug part, and id from a built chapter URL', () => {
    const journey = { id: 'jid1234567', title: 'Intro to Rust' };
    const chapter = { id: 'cid1234567', idx: 0, title: 'Installing Python' };
    const fullPath = chapterPath(journey, chapter);
    const segment = fullPath.split('/').pop();
    expect(segment).toBeDefined();
    if (segment === undefined) {
      throw new Error('expected chapter segment in path');
    }
    expect(parseChapterSlug(segment)).toEqual({
      n: 1,
      slugPart: 'installing-python',
      id: 'cid1234567',
    });
  });

  it('recovers from a chapter path with an accented French title', () => {
    const journey = { id: 'jid1234567', title: 'Parcours' };
    const chapter = { id: 'abc123def4', idx: 1, title: 'Démarrage rapide' };
    const fullPath = chapterPath(journey, chapter);
    const segment = fullPath.split('/').pop();
    expect(segment).toBeDefined();
    if (segment === undefined) {
      throw new Error('expected chapter segment in path');
    }
    expect(parseChapterSlug(segment)).toEqual({
      n: 2,
      slugPart: 'demarrage-rapide',
      id: 'abc123def4',
    });
  });
});
