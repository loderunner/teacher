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

  it('should get the journey', async () => {
    mockDb.select.from.where.mockResolvedValueOnce([
      {
        id: '123',
        title: 'Test Journey',
        styleId: '456',
        syllabus: {
          chapters: [
            {
              title: 'Variables and control flow',
              summary: 'Foundations before building larger programs.',
              sections: ['Assignments', 'Conditionals', 'Loops'],
            },
          ],
        },
      },
    ]);
    mockDb.select.from.where.mockResolvedValueOnce([
      {
        id: '123',
        idx: 0,
        title: 'Test Chapter',
        status: 'locked',
        summary: 'Test Summary',
      },
      {
        id: '456',
        idx: 1,
        title: 'Test Chapter 2',
        status: 'locked',
        summary: 'Test Summary 2',
      },
    ]);

    const journey = await getJourney({ userId: '789', id: '123' });

    expect(journey).toEqual({
      id: '123',
      title: 'Test Journey',
      styleId: '456',
      syllabus: {
        chapters: [
          {
            title: 'Variables and control flow',
            summary: 'Foundations before building larger programs.',
            sections: ['Assignments', 'Conditionals', 'Loops'],
          },
        ],
      },
      chapters: [
        {
          id: '123',
          idx: 0,
          title: 'Test Chapter',
          status: 'locked',
          summary: 'Test Summary',
        },
        {
          id: '456',
          idx: 1,
          title: 'Test Chapter 2',
          status: 'locked',
          summary: 'Test Summary 2',
        },
      ],
    });
  });
});
