import { type ChainMock, chainMock } from 'chain-mock';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createJourney } from './create';

const { transactionImpl } = vi.hoisted(() => ({
  transactionImpl: vi.fn(),
}));

vi.mock('@/lib/server/db', () => ({
  db: chainMock(),
  dbTx: { transaction: transactionImpl },
}));

describe('createJourney', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a journey and inserts chapters when syllabus has chapters', async () => {
    transactionImpl.mockImplementationOnce(
      (callback: (tx: ChainMock) => Promise<unknown>) => {
        const mockTx = chainMock();

        const insertJourneysChain = chainMock();
        insertJourneysChain.values.returning.mockResolvedValueOnce([
          { id: 'new-id', title: 'My Journey' },
        ]);
        mockTx.insert.mockReturnValueOnce(insertJourneysChain);

        const insertChaptersChain = chainMock();
        insertChaptersChain.values.mockResolvedValueOnce([]);
        mockTx.insert.mockReturnValueOnce(insertChaptersChain);

        return callback(mockTx);
      },
    );

    const result = await createJourney({
      userId: 'user-1',
      title: 'My Journey',
      styleId: 'style-1',
      syllabus: {
        chapters: [
          { title: 'Chapter One', summary: 'First chapter.' },
          { title: 'Chapter Two', summary: 'Second chapter.' },
        ],
      },
      memory: 'Learner is a beginner.',
    });

    expect(transactionImpl).toHaveBeenCalledOnce();
    expect(result).toEqual({ id: 'new-id', title: 'My Journey' });
  });

  it('creates a journey without inserting chapters when syllabus has no chapters', async () => {
    let insertCallCount = 0;

    transactionImpl.mockImplementationOnce(
      (callback: (tx: ChainMock) => Promise<unknown>) => {
        const mockTx = chainMock();

        const insertJourneysChain = chainMock();
        insertJourneysChain.values.returning.mockResolvedValueOnce([
          { id: 'new-id', title: 'Empty Journey' },
        ]);
        mockTx.insert.mockImplementation(() => {
          insertCallCount++;
          return insertJourneysChain;
        });

        return callback(mockTx);
      },
    );

    const result = await createJourney({
      userId: 'user-1',
      title: 'Empty Journey',
      styleId: 'style-1',
      syllabus: { chapters: [] },
      memory: 'No chapters yet.',
    });

    expect(transactionImpl).toHaveBeenCalledOnce();
    expect(result).toEqual({ id: 'new-id', title: 'Empty Journey' });
    expect(insertCallCount).toBe(1);
  });

  it('assigns status active to first chapter and locked to the rest', async () => {
    type ChapterValue = {
      journeyId: string;
      idx: number;
      title: string;
      status: string;
    };
    let capturedChapterValues: ChapterValue[] = [];

    transactionImpl.mockImplementationOnce(
      (callback: (tx: ChainMock) => Promise<unknown>) => {
        const mockTx = chainMock();

        const insertJourneysChain = chainMock();
        insertJourneysChain.values.returning.mockResolvedValueOnce([
          { id: 'journey-id', title: 'Multi Chapter' },
        ]);
        mockTx.insert.mockReturnValueOnce(insertJourneysChain);

        const insertChaptersChain = chainMock();
        insertChaptersChain.values.mockImplementationOnce(
          (values: ChapterValue[]) => {
            capturedChapterValues = values;
            return Promise.resolve([]);
          },
        );
        mockTx.insert.mockReturnValueOnce(insertChaptersChain);

        return callback(mockTx);
      },
    );

    await createJourney({
      userId: 'user-1',
      title: 'Multi Chapter',
      styleId: 'style-1',
      syllabus: {
        chapters: [{ title: 'First' }, { title: 'Second' }, { title: 'Third' }],
      },
      memory: 'Three chapters.',
    });

    expect(capturedChapterValues).toHaveLength(3);
    expect(capturedChapterValues[0].status).toBe('active');
    expect(capturedChapterValues[1].status).toBe('locked');
    expect(capturedChapterValues[2].status).toBe('locked');
  });
});
