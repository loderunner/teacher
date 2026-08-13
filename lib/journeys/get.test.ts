import { chainMocked } from 'chain-mock';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getJourney } from './get';

import { db } from '@/lib/db';

vi.mock('@/lib/db');

const mockDb = chainMocked(db);

describe('getJourney', () => {
  beforeEach(() => {
    mockDb.mockReset();
  });

  it('returns a fully hydrated journey when rows exist', async () => {
    const syllabusDraft = {
      chapters: [
        {
          title: 'Variables and control flow',
          overview: 'Foundations before building larger programs.',
          sections: ['Assignments', 'Conditionals', 'Loops'],
        },
      ],
    };

    mockDb.select.from.where.mockResolvedValueOnce([
      {
        id: '123',
        title: 'Test Journey',
        styleId: '456',
        memory: [],
        syllabusDraft,
        status: 'active',
      },
    ]);
    mockDb.select.from.where.orderBy.mockResolvedValueOnce([
      {
        id: 'ch-1',
        idx: 0,
        title: 'Variables and control flow',
        status: 'active',
        summary: null,
        overview: 'Foundations before building larger programs.',
        sections: ['Assignments', 'Conditionals', 'Loops'],
      },
    ]);

    const journey = await getJourney({ userId: '789', id: '123' });

    expect(journey).toEqual({
      id: '123',
      title: 'Test Journey',
      styleId: '456',
      memory: [],
      status: 'active',
      syllabusDraft,
      chapters: [
        {
          id: 'ch-1',
          idx: 0,
          title: 'Variables and control flow',
          status: 'active',
          summary: null,
          overview: 'Foundations before building larger programs.',
          sections: ['Assignments', 'Conditionals', 'Loops'],
        },
      ],
    });
  });

  it('returns a journey with a null syllabus draft when the column is null', async () => {
    mockDb.select.from.where.mockResolvedValueOnce([
      {
        id: '123',
        title: 'Draft Journey',
        styleId: 'teacher',
        memory: [],
        syllabusDraft: null,
        status: 'drafting',
      },
    ]);
    mockDb.select.from.where.orderBy.mockResolvedValueOnce([]);

    const journey = await getJourney({ userId: '789', id: '123' });

    expect(journey).not.toBeNull();
    expect(journey!.syllabusDraft).toBeNull();
  });

  it('returns a journey with a null syllabus draft when the column fails validation', async () => {
    mockDb.select.from.where.mockResolvedValueOnce([
      {
        id: '123',
        title: 'Draft Journey',
        styleId: 'teacher',
        memory: [],
        syllabusDraft: { chapters: [] },
        status: 'drafting',
      },
    ]);
    mockDb.select.from.where.orderBy.mockResolvedValueOnce([]);

    const journey = await getJourney({ userId: '789', id: '123' });

    expect(journey).not.toBeNull();
    expect(journey!.syllabusDraft).toBeNull();
  });

  it('returns null when the journey rows array is empty', async () => {
    mockDb.select.from.where.mockResolvedValueOnce([]);

    const journey = await getJourney({ userId: '789', id: '123' });

    expect(journey).toBeNull();
  });

  it('returns a journey with multiple chapters in order', async () => {
    const syllabusDraft = {
      chapters: [
        {
          title: 'Chapter One',
          overview: 'First chapter.',
          sections: ['Overview'],
        },
        {
          title: 'Chapter Two',
          overview: 'Second chapter.',
          sections: ['Overview'],
        },
      ],
    };

    mockDb.select.from.where.mockResolvedValueOnce([
      {
        id: '123',
        title: 'Multi-Chapter Journey',
        styleId: '456',
        memory: ['Learner prefers examples.'],
        syllabusDraft,
        status: 'active',
      },
    ]);
    mockDb.select.from.where.orderBy.mockResolvedValueOnce([
      {
        id: 'ch-1',
        idx: 0,
        title: 'Chapter One',
        status: 'done',
        summary: 'Done.',
        overview: 'First chapter.',
        sections: ['Overview'],
      },
      {
        id: 'ch-2',
        idx: 1,
        title: 'Chapter Two',
        status: 'active',
        summary: null,
        // Renamed by a later syllabus change — the row is the source of
        // truth, so this must not be overwritten by the frozen draft above.
        overview: 'Second chapter, revised.',
        sections: ['Overview', 'Extra'],
      },
    ]);

    const journey = await getJourney({ userId: '789', id: '123' });

    expect(journey).not.toBeNull();
    expect(journey!.memory).toEqual(['Learner prefers examples.']);
    expect(journey!.status).toBe('active');
    expect(journey!.chapters).toHaveLength(2);
    expect(journey!.chapters[0]).toEqual({
      id: 'ch-1',
      idx: 0,
      title: 'Chapter One',
      status: 'done',
      summary: 'Done.',
      overview: 'First chapter.',
      sections: ['Overview'],
    });
    expect(journey!.chapters[1]).toEqual({
      id: 'ch-2',
      idx: 1,
      title: 'Chapter Two',
      status: 'active',
      summary: null,
      overview: 'Second chapter, revised.',
      sections: ['Overview', 'Extra'],
    });
  });
});
