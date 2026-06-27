import { chainMocked } from 'chain-mock';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getJourney } from './get';

import { db } from '@/lib/server/db';

vi.mock('@/lib/server/db');

const mockDb = chainMocked(db);

describe('getJourney', () => {
  beforeEach(() => {
    mockDb.mockReset();
  });

  it('returns a fully hydrated journey when rows exist', async () => {
    const syllabus = {
      chapters: [
        {
          title: 'Variables and control flow',
          summary: 'Foundations before building larger programs.',
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
        syllabus,
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
      },
    ]);

    const journey = await getJourney({ userId: '789', id: '123' });

    expect(journey).toEqual({
      id: '123',
      title: 'Test Journey',
      styleId: '456',
      memory: [],
      status: 'active',
      syllabus,
      chapters: [
        {
          id: 'ch-1',
          idx: 0,
          title: 'Variables and control flow',
          status: 'active',
          summary: null,
        },
      ],
    });
  });

  it('returns a journey with null syllabus when the column is null', async () => {
    mockDb.select.from.where.mockResolvedValueOnce([
      {
        id: '123',
        title: 'Draft Journey',
        styleId: 'teacher',
        memory: [],
        syllabus: null,
        status: 'drafting',
      },
    ]);
    mockDb.select.from.where.orderBy.mockResolvedValueOnce([]);

    const journey = await getJourney({ userId: '789', id: '123' });

    expect(journey).not.toBeNull();
    expect(journey!.syllabus).toBeNull();
  });

  it('returns a journey with null syllabus when the column fails validation', async () => {
    mockDb.select.from.where.mockResolvedValueOnce([
      {
        id: '123',
        title: 'Draft Journey',
        styleId: 'teacher',
        memory: [],
        syllabus: { chapters: [] },
        status: 'drafting',
      },
    ]);
    mockDb.select.from.where.orderBy.mockResolvedValueOnce([]);

    const journey = await getJourney({ userId: '789', id: '123' });

    expect(journey).not.toBeNull();
    expect(journey!.syllabus).toBeNull();
  });

  it('returns null when the journey rows array is empty', async () => {
    mockDb.select.from.where.mockResolvedValueOnce([]);

    const journey = await getJourney({ userId: '789', id: '123' });

    expect(journey).toBeNull();
  });

  it('returns a journey with multiple chapters in order', async () => {
    const syllabus = {
      chapters: [
        {
          title: 'Chapter One',
          summary: 'First chapter.',
          sections: ['Overview'],
        },
        {
          title: 'Chapter Two',
          summary: 'Second chapter.',
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
        syllabus,
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
      },
      {
        id: 'ch-2',
        idx: 1,
        title: 'Chapter Two',
        status: 'active',
        summary: null,
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
    });
    expect(journey!.chapters[1]).toEqual({
      id: 'ch-2',
      idx: 1,
      title: 'Chapter Two',
      status: 'active',
      summary: null,
    });
  });
});
