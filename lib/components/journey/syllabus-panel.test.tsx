import { describe, expect, it } from 'vitest';

import type { Journey } from '@/lib/journeys/get';

import {
  buildActivatedChapters,
  buildDraftChapters,
  chapterValue,
  collapsible,
  collapsibleChapterValues,
} from './syllabus-panel-data';

const baseJourney: Journey = {
  id: 'journey123456',
  title: 'Test Journey',
  styleId: 'teacher',
  memory: [],
  status: 'active',
  // Deliberately stale: frozen at activation and since diverged from the
  // chapter rows below. Nothing in the sidebar may read from it.
  syllabusDraft: {
    chapters: [
      { title: 'Intro', overview: 'Stale overview', sections: ['Stale sec'] },
    ],
  },
  chapters: [
    {
      id: 'ch1',
      idx: 0,
      title: 'Intro',
      status: 'done',
      summary: null,
      overview: 'Intro overview',
      sections: ['Sec A'],
    },
    {
      id: 'ch2',
      idx: 1,
      title: 'Advanced',
      status: 'active',
      summary: null,
      overview: 'Adv overview',
      sections: ['Sec B', 'Sec C'],
    },
    {
      id: 'ch3',
      idx: 2,
      title: 'Wrap up',
      status: 'locked',
      summary: null,
      overview: '',
      sections: ['Sec C'],
    },
  ],
};

describe('buildDraftChapters', () => {
  it('returns empty array when draft is null', () => {
    expect(buildDraftChapters(null)).toEqual([]);
  });

  it('returns empty array when draft has no chapters', () => {
    expect(buildDraftChapters({ chapters: [] })).toEqual([]);
  });

  it('returns empty array when all chapters lack titles', () => {
    expect(
      buildDraftChapters({ chapters: [{ overview: 'no title' }] }),
    ).toEqual([]);
  });

  it('returns chapters with draft status and no href', () => {
    const chapters = buildDraftChapters({
      chapters: [
        { title: 'Chapter One', overview: 'An overview', sections: ['Sec A'] },
        { title: 'Chapter Two', overview: undefined, sections: undefined },
      ],
    });

    expect(chapters).toHaveLength(2);
    expect(chapters[0]).toEqual({
      title: 'Chapter One',
      overview: 'An overview',
      sections: ['Sec A'],
      status: 'draft',
      href: undefined,
    });
    expect(chapters[1]).toEqual({
      title: 'Chapter Two',
      overview: undefined,
      sections: undefined,
      status: 'draft',
      href: undefined,
    });
  });

  it('passes through section labels unchanged', () => {
    const chapters = buildDraftChapters({
      chapters: [
        {
          title: 'Chapter',
          sections: ['Sec A', 'Sec B'],
        },
      ],
    });
    expect(chapters[0].sections).toEqual(['Sec A', 'Sec B']);
  });
});

describe('buildActivatedChapters', () => {
  it('takes every field from the chapter row', () => {
    const chapters = buildActivatedChapters(baseJourney);

    expect(chapters[0].title).toBe('Intro');
    expect(chapters[0].overview).toBe('Intro overview');
    expect(chapters[0].sections).toEqual(['Sec A']);

    expect(chapters[1].title).toBe('Advanced');
    expect(chapters[1].overview).toBe('Adv overview');
    expect(chapters[1].sections).toEqual(['Sec B', 'Sec C']);
  });

  it('never reads content from the frozen syllabus draft', () => {
    // The draft holds one stale chapter; the rows hold three current ones.
    // A positional join would surface 'Stale overview' at index 0 and leave
    // the rest undefined — the drift that made this rewrite necessary.
    const chapters = buildActivatedChapters(baseJourney);

    expect(chapters).toHaveLength(3);
    expect(chapters.map((c) => c.overview)).toEqual([
      'Intro overview',
      'Adv overview',
      '',
    ]);
  });

  it('sets correct status for each chapter', () => {
    const chapters = buildActivatedChapters(baseJourney);
    expect(chapters[0].status).toBe('done');
    expect(chapters[1].status).toBe('active');
    expect(chapters[2].status).toBe('locked');
  });

  it('sets href for done and active chapters, not for locked', () => {
    const chapters = buildActivatedChapters(baseJourney);
    expect(chapters[0].href).toBeDefined();
    expect(chapters[1].href).toBeDefined();
    expect(chapters[2].href).toBeUndefined();
  });

  it('builds chapters even when the journey has no syllabus draft', () => {
    const journey: Journey = { ...baseJourney, syllabusDraft: null };
    const chapters = buildActivatedChapters(journey);

    expect(chapters).toHaveLength(3);
    expect(chapters[0].overview).toBe('Intro overview');
    expect(chapters[0].sections).toEqual(['Sec A']);
  });
});

describe('chapterValue', () => {
  it('formats the item value for a chapter index', () => {
    expect(chapterValue(0)).toBe('chapter-0');
    expect(chapterValue(3)).toBe('chapter-3');
  });
});

describe('collapsible', () => {
  it('returns true when the chapter has an overview', () => {
    expect(collapsible({ overview: 'An overview', status: 'draft' })).toBe(
      true,
    );
  });

  it('returns true when the chapter has non-empty sections', () => {
    expect(collapsible({ sections: ['Sec A'], status: 'draft' })).toBe(true);
  });

  it('returns false when the chapter has neither overview nor sections', () => {
    expect(collapsible({ status: 'draft' })).toBe(false);
  });

  it('returns false when sections is an empty array', () => {
    expect(collapsible({ sections: [], status: 'draft' })).toBe(false);
  });
});

describe('collapsibleChapterValues', () => {
  it('returns item values for only the collapsible chapters', () => {
    const chapters = [
      { overview: 'An overview', status: 'draft' as const },
      { status: 'draft' as const },
      { sections: ['Sec A'], status: 'draft' as const },
    ];

    expect(collapsibleChapterValues(chapters)).toEqual([
      'chapter-0',
      'chapter-2',
    ]);
  });

  it('returns an empty array when no chapters are collapsible', () => {
    expect(collapsibleChapterValues([{ status: 'draft' }])).toEqual([]);
  });
});
