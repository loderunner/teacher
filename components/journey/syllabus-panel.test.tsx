import { describe, expect, it } from 'vitest';

import {
  buildActivatedChapters,
  buildDraftChapters,
} from './syllabus-panel-data';

import type { Journey } from '@/lib/server/journeys/get';

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
      { title: 'Wrap up', summary: undefined, sections: undefined },
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
      current: false,
    });
    expect(chapters[1]).toEqual({
      title: 'Chapter Two',
      summary: undefined,
      sections: undefined,
      status: 'draft',
      href: undefined,
      current: false,
    });
  });

  it('filters out undefined section entries', () => {
    const chapters = buildDraftChapters({
      chapters: [
        {
          title: 'Chapter',
          sections: ['Sec A', undefined, 'Sec B'] as (string | undefined)[],
        },
      ],
    });
    expect(chapters[0].sections).toEqual(['Sec A', 'Sec B']);
  });
});

describe('buildActivatedChapters', () => {
  it('joins journey.chapters with journey.syllabus.chapters by index', () => {
    const chapters = buildActivatedChapters(baseJourney, {
      type: 'chapter',
      idx: 1,
    });

    expect(chapters[0].title).toBe('Intro');
    expect(chapters[0].summary).toBe('Intro summary');
    expect(chapters[0].sections).toEqual(['Sec A']);

    expect(chapters[1].title).toBe('Advanced');
    expect(chapters[1].summary).toBe('Adv summary');
    expect(chapters[1].sections).toEqual(['Sec B', 'Sec C']);
  });

  it('sets correct status for each chapter', () => {
    const chapters = buildActivatedChapters(baseJourney, { type: 'syllabus' });
    expect(chapters[0].status).toBe('done');
    expect(chapters[1].status).toBe('active');
    expect(chapters[2].status).toBe('locked');
  });

  it('sets current=true for the matching chapter index', () => {
    const chapters = buildActivatedChapters(baseJourney, {
      type: 'chapter',
      idx: 1,
    });
    expect(chapters[0].current).toBe(false);
    expect(chapters[1].current).toBe(true);
    expect(chapters[2].current).toBe(false);
  });

  it('sets current=false for all chapters when current is syllabus', () => {
    const chapters = buildActivatedChapters(baseJourney, { type: 'syllabus' });
    expect(chapters.every((c) => !c.current)).toBe(true);
  });

  it('sets href for done and active chapters, not for locked', () => {
    const chapters = buildActivatedChapters(baseJourney, { type: 'syllabus' });
    expect(chapters[0].href).toBeDefined();
    expect(chapters[1].href).toBeDefined();
    expect(chapters[2].href).toBeUndefined();
  });

  it('uses undefined summary and sections when syllabus chapter is missing', () => {
    const journey: Journey = {
      ...baseJourney,
      syllabus: { chapters: [] },
    };
    const chapters = buildActivatedChapters(journey, { type: 'syllabus' });
    expect(chapters[0].summary).toBeUndefined();
    expect(chapters[0].sections).toBeUndefined();
  });
});
