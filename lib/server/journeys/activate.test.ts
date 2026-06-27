import { type ChainMock, chainMock } from 'chain-mock';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { activateJourney } from './activate';

const { transactionImpl } = vi.hoisted(() => ({
  transactionImpl: vi.fn(),
}));

vi.mock('@/lib/server/db', () => ({
  db: chainMock(),
  dbTx: { transaction: transactionImpl },
}));

describe('activateJourney', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('updates the journey and inserts chapters with the first active', async () => {
    type ChapterValue = {
      journeyId: string;
      idx: number;
      title: string;
      status: string;
    };
    let chapterRows: ChapterValue[] = [];

    transactionImpl.mockImplementationOnce(
      (callback: (tx: ChainMock) => Promise<unknown>) => {
        const mockTx = chainMock();

        const updateChain = chainMock();
        updateChain.set.mockReturnValueOnce(updateChain);
        updateChain.where.mockReturnValueOnce(updateChain);
        updateChain.returning.mockResolvedValueOnce([
          { id: 'j1', title: 'Final Title' },
        ]);
        mockTx.update.mockReturnValueOnce(updateChain);

        const insertChapters = chainMock();
        insertChapters.values.mockImplementationOnce(
          (values: ChapterValue[]) => {
            chapterRows = values;
            return Promise.resolve([]);
          },
        );
        mockTx.insert.mockReturnValueOnce(insertChapters);

        return callback(mockTx);
      },
    );

    const result = await activateJourney({
      userId: 'user-1',
      journeyId: 'j1',
      title: 'Final Title',
      memory: ['M'],
      syllabus: {
        chapters: [
          { title: 'A', summary: '', sections: ['Overview'] },
          { title: 'B', summary: '', sections: ['Overview'] },
        ],
      },
    });

    expect(result).toEqual({ id: 'j1', title: 'Final Title' });
    expect(chapterRows).toHaveLength(2);
    expect(chapterRows[0].status).toBe('active');
    expect(chapterRows[1].status).toBe('locked');
  });

  it('throws when no drafting row matches', async () => {
    transactionImpl.mockImplementationOnce(
      (callback: (tx: ChainMock) => Promise<unknown>) => {
        const mockTx = chainMock();
        const updateChain = chainMock();
        updateChain.set.mockReturnValueOnce(updateChain);
        updateChain.where.mockReturnValueOnce(updateChain);
        updateChain.returning.mockResolvedValueOnce([]);
        mockTx.update.mockReturnValueOnce(updateChain);
        return callback(mockTx);
      },
    );

    await expect(
      activateJourney({
        userId: 'user-1',
        journeyId: 'missing',
        title: 'T',
        memory: [],
        syllabus: { chapters: [] },
      }),
    ).rejects.toThrow(
      'Journey not found, not owned by user, or not in drafting status',
    );
  });
});
