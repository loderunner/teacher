import { type ChainMock, chainMock } from 'chain-mock';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { syncMessages } from './sync';

const { transactionImpl } = vi.hoisted(() => ({
  transactionImpl: vi.fn(),
}));

vi.mock('@/lib/server/db', () => ({
  dbTx: { transaction: transactionImpl },
}));

let mockTx: ChainMock;

beforeEach(() => {
  vi.clearAllMocks();
  mockTx = chainMock();
  transactionImpl.mockImplementation(
    async (callback: (tx: ChainMock) => unknown) => callback(mockTx),
  );
});

describe('syncMessages', () => {
  it('deletes the whole scope when given an empty message list', async () => {
    await syncMessages({ journeyId: 'j1', chapterId: null, messages: [] });

    expect(transactionImpl).toHaveBeenCalledOnce();
    expect(mockTx.delete).toHaveBeenCalledOnce();
    expect(mockTx.insert).not.toHaveBeenCalled();
  });

  it('deletes orphans and upserts when the list is non-empty', async () => {
    await syncMessages({
      journeyId: 'j1',
      chapterId: null,
      messages: [
        { id: 'm1', role: 'user', parts: [{ type: 'text', text: 'Hi' }] },
      ],
    });

    expect(transactionImpl).toHaveBeenCalledOnce();
    expect(mockTx.delete).toHaveBeenCalledOnce();
    expect(mockTx.insert).toHaveBeenCalledOnce();
    expect(mockTx.insert.values.onConflictDoUpdate).toHaveBeenCalledOnce();
  });

  it('passes each message id to the insert values', async () => {
    await syncMessages({
      journeyId: 'j1',
      chapterId: 'c1',
      messages: [
        { id: 'm1', role: 'user', parts: [{ type: 'text', text: 'Hi' }] },
        { id: 'm2', role: 'assistant', parts: [{ type: 'text', text: 'Yo' }] },
      ],
    });

    expect(mockTx.insert.values).toHaveBeenCalledExactlyOnceWith([
      {
        id: 'm1',
        journeyId: 'j1',
        chapterId: 'c1',
        role: 'user',
        parts: [{ type: 'text', text: 'Hi' }],
      },
      {
        id: 'm2',
        journeyId: 'j1',
        chapterId: 'c1',
        role: 'assistant',
        parts: [{ type: 'text', text: 'Yo' }],
      },
    ]);
  });
});
