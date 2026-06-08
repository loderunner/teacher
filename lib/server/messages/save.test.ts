import { chainMock, chainMocked } from 'chain-mock';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { saveMessages } from './save';

import { db } from '@/lib/server/db';

vi.mock('@/lib/server/db', () => ({ db: chainMock() }));

const mockDb = chainMocked(db);

describe('saveMessages', () => {
  beforeEach(() => {
    mockDb.mockReset();
  });

  it('is a no-op when given an empty message list', async () => {
    await saveMessages({ journeyId: 'j1', chapterId: null, messages: [] });

    expect(mockDb.insert).not.toHaveBeenCalled();
  });

  it('upserts messages for syllabus scope', async () => {
    await saveMessages({
      journeyId: 'j1',
      chapterId: null,
      messages: [
        { id: 'm1', role: 'user', parts: [{ type: 'text', text: 'Hi' }] },
      ],
    });

    expect(mockDb.insert).toHaveBeenCalledOnce();
    expect(mockDb.insert.values.onConflictDoUpdate).toHaveBeenCalledOnce();
  });

  it('upserts messages for chapter scope', async () => {
    await saveMessages({
      journeyId: 'j1',
      chapterId: 'c1',
      messages: [
        { id: 'm1', role: 'user', parts: [{ type: 'text', text: 'Hi' }] },
      ],
    });

    expect(mockDb.insert.values).toHaveBeenCalledExactlyOnceWith([
      {
        id: 'm1',
        journeyId: 'j1',
        chapterId: 'c1',
        role: 'user',
        parts: [{ type: 'text', text: 'Hi' }],
        metadata: null,
      },
    ]);
  });

  it('persists metadata when present', async () => {
    await saveMessages({
      journeyId: 'j1',
      chapterId: null,
      messages: [
        {
          id: 'm1',
          role: 'user',
          parts: [{ type: 'text', text: 'Begin.' }],
          metadata: { hidden: true },
        },
      ],
    });

    expect(mockDb.insert.values).toHaveBeenCalledExactlyOnceWith([
      {
        id: 'm1',
        journeyId: 'j1',
        chapterId: null,
        role: 'user',
        parts: [{ type: 'text', text: 'Begin.' }],
        metadata: { hidden: true },
      },
    ]);
  });

  it('isolates scope — does not mix journeys', async () => {
    await saveMessages({
      journeyId: 'j2',
      chapterId: 'c2',
      messages: [{ id: 'm2', role: 'assistant', parts: [] }],
    });

    expect(mockDb.insert.values).toHaveBeenCalledExactlyOnceWith([
      expect.objectContaining({ journeyId: 'j2', chapterId: 'c2' }),
    ]);
  });
});
