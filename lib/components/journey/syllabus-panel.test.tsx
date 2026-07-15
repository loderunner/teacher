import { describe, expect, it } from 'vitest';

import {
  buildActivatedChapters,
  buildDraftChapters,
  chapterValue,
  collapsible,
  collapsibleChapterValues,
} from './syllabus-panel-data';

import type { Journey } from '@/lib/journeys/get';

const baseJourney: Journey = {
  id: 'journey123456',
  title: 'Test Journey',
  styleId: 'teacher',
  memory: [],
  status: 'active',
  syllabus: {
    chapters: [
      { title: 'Intro', summary: 'Intro summary', sections: ['Sec A'] },
      {
        title: 'Advanced',
        summary: 'Adv summary',
        sections: ['Sec B', 'Sec C'],
      },
      { title: 'Wrap up', summary: '', sections: ['Sec C'] },
    ],
  },
  chapters: [
    { id: 'ch1', idx: 0, title: 'Intro', status: 'done', summary: null },
    { id: 'ch2', idx: 1, title: 'Advanced', status: 'active', summary: null },
    { id: 'ch3', idx: 2, title: 'Wrap up', status: 'locked', summary: null },
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
    expect(buildDraftChapters({ chapters: [{ summary: 'no title' }] })).toEqual(
      [],
    );
  });

  it('returns chapters with draft status and no href', () => {
    const chapters = buildDraftChapters({
      chapters: [
        { title: 'Chapter One', summary: 'A summary', sections: ['Sec A'] },
        { title: 'Chapter Two', summary: undefined, sections: undefined },
      ],
    });

    expect(chapters).toHaveLength(2);
    expect(chapters[0]).toEqual({
      title: 'Chapter One',
      summary: 'A summary',
      sections: ['Sec A'],
      status: 'draft',
      href: undefined,
    });
    expect(chapters[1]).toEqual({
      title: 'Chapter Two',
      summary: undefined,
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
  it('joins journey.chapters with journey.syllabus.chapters by index', () => {
    const chapters = buildActivatedChapters(baseJourney);

    expect(chapters[0].title).toBe('Intro');
    expect(chapters[0].summary).toBe('Intro summary');
    expect(chapters[0].sections).toEqual(['Sec A']);

    expect(chapters[1].title).toBe('Advanced');
    expect(chapters[1].summary).toBe('Adv summary');
    expect(chapters[1].sections).toEqual(['Sec B', 'Sec C']);
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

  it('uses undefined summary and sections when syllabus chapter is missing', () => {
    const journey: Journey = {
      ...baseJourney,
      syllabus: { chapters: [] },
    };
    const chapters = buildActivatedChapters(journey);
    expect(chapters[0].summary).toBeUndefined();
    expect(chapters[0].sections).toBeUndefined();
  });
});

describe('chapterValue', () => {
  it('formats the item value for a chapter index', () => {
    expect(chapterValue(0)).toBe('chapter-0');
    expect(chapterValue(3)).toBe('chapter-3');
  });
});

describe('collapsible', () => {
  it('returns true when the chapter has a summary', () => {
    expect(collapsible({ summary: 'A summary', status: 'draft' })).toBe(true);
  });

  it('returns true when the chapter has non-empty sections', () => {
    expect(collapsible({ sections: ['Sec A'], status: 'draft' })).toBe(true);
  });

  it('returns false when the chapter has neither summary nor sections', () => {
    expect(collapsible({ status: 'draft' })).toBe(false);
  });

  it('returns false when sections is an empty array', () => {
    expect(collapsible({ sections: [], status: 'draft' })).toBe(false);
  });
});

describe('collapsibleChapterValues', () => {
  it('returns item values for only the collapsible chapters', () => {
    const chapters = [
      { summary: 'A summary', status: 'draft' as const },
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
