import { type ChainMock, chainMock } from 'chain-mock';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { syncMessages } from './sync';

const { transactionImpl } = vi.hoisted(() => ({
  transactionImpl: vi.fn(),
}));

vi.mock('@/lib/server/db', () => ({
  dbTx: { transaction: transactionImpl },
}));

describe('syncMessages', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deletes all rows for the scope when the message list is empty', async () => {
    transactionImpl.mockImplementationOnce(
      (callback: (tx: ChainMock) => Promise<unknown>) => {
        const mockTx = chainMock();
        const deleteChain = chainMock();
        deleteChain.where.mockResolvedValueOnce(undefined);
        mockTx.delete.mockReturnValueOnce(deleteChain);
        return callback(mockTx);
      },
    );

    await syncMessages({
      journeyId: 'j1',
      chapterId: null,
      messages: [],
    });

    expect(transactionImpl).toHaveBeenCalledOnce();
  });

  it('deletes orphans then upserts when the list is non-empty', async () => {
    transactionImpl.mockImplementationOnce(
      (callback: (tx: ChainMock) => Promise<unknown>) => {
        const mockTx = chainMock();

        const deleteOrphansChain = chainMock();
        deleteOrphansChain.where.mockResolvedValueOnce(undefined);
        mockTx.delete.mockReturnValueOnce(deleteOrphansChain);

        const insertChain = chainMock();
        insertChain.values.mockImplementation(() => insertChain);
        insertChain.onConflictDoUpdate.mockResolvedValueOnce(undefined);
        mockTx.insert.mockReturnValueOnce(insertChain);

        return callback(mockTx);
      },
    );

    await syncMessages({
      journeyId: 'j1',
      chapterId: null,
      messages: [
        {
          id: 'm1',
          role: 'user',
          parts: [{ type: 'text', text: 'Hi' }],
        },
      ],
    });

    expect(transactionImpl).toHaveBeenCalledOnce();
  });
});
