import { type ChainMock, chainMock } from 'chain-mock';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { applySyllabusChange } from './applySyllabusChange';

const { transactionImpl } = vi.hoisted(() => ({
  transactionImpl: vi.fn(),
}));

vi.mock('@/lib/server/db', () => ({
  db: chainMock(),
  dbTx: { transaction: transactionImpl },
}));

const existingChapters = [
  { id: 'ch-active-0', idx: 0, title: 'Active Chapter', status: 'active' },
  { id: 'ch-locked-1', idx: 1, title: 'Locked Chapter', status: 'locked' },
];

/** Sets up a transaction mock that returns the given journey and chapter rows. */
const setupTx = (
  journeyRows: { id: string }[],
  chapterRows: typeof existingChapters,
): ChainMock => {
  const mockTx = chainMock();
  mockTx.select.from.where.mockResolvedValueOnce(journeyRows);
  mockTx.select.from.where.orderBy.mockResolvedValueOnce(chapterRows);
  transactionImpl.mockImplementationOnce(
    (cb: (tx: ChainMock) => Promise<unknown>) => cb(mockTx),
  );
  return mockTx;
};

describe('applySyllabusChange', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('error cases', () => {
    it('throws when the journey is not found', async () => {
      setupTx([], existingChapters);

      await expect(
        applySyllabusChange({
          userId: 'user-1',
          journeyId: 'journey-1',
          newSyllabus: {
            chapters: [{ id: 'ch-active-0', title: 'Active Chapter' }],
          },
        }),
      ).rejects.toThrow('Journey not found');
    });

    it('throws when there is no active chapter', async () => {
      setupTx(
        [{ id: 'journey-1' }],
        [{ id: 'ch-locked-0', idx: 0, title: 'Locked', status: 'locked' }],
      );

      await expect(
        applySyllabusChange({
          userId: 'user-1',
          journeyId: 'journey-1',
          newSyllabus: {
            chapters: [{ id: 'ch-locked-0', title: 'Locked' }],
          },
        }),
      ).rejects.toThrow('Invalid journey state: no active chapter');
    });

    it('throws when the proposal references an unknown chapter id', async () => {
      setupTx([{ id: 'journey-1' }], existingChapters);

      await expect(
        applySyllabusChange({
          userId: 'user-1',
          journeyId: 'journey-1',
          newSyllabus: {
            chapters: [
              { id: 'ch-active-0', title: 'Active Chapter' },
              { id: 'ch-unknown-id', title: 'Ghost Chapter' },
            ],
          },
        }),
      ).rejects.toThrow(
        'Proposal references unknown chapter id: ch-unknown-id',
      );
    });

    it('throws when the proposal removes a done chapter', async () => {
      setupTx(
        [{ id: 'journey-1' }],
        [
          { id: 'ch-done-0', idx: 0, title: 'Done Chapter', status: 'done' },
          {
            id: 'ch-active-1',
            idx: 1,
            title: 'Active Chapter',
            status: 'active',
          },
        ],
      );

      await expect(
        applySyllabusChange({
          userId: 'user-1',
          journeyId: 'journey-1',
          newSyllabus: {
            // ch-done-0 is intentionally omitted — should be rejected
            chapters: [{ id: 'ch-active-1', title: 'Active Chapter' }],
          },
        }),
      ).rejects.toThrow('Proposal would remove 1 done/active chapter(s)');
    });

    it('throws when the proposal removes the active chapter', async () => {
      setupTx([{ id: 'journey-1' }], existingChapters);

      await expect(
        applySyllabusChange({
          userId: 'user-1',
          journeyId: 'journey-1',
          newSyllabus: {
            // ch-active-0 omitted — should be rejected
            chapters: [{ id: 'ch-locked-1', title: 'Locked Chapter' }],
          },
        }),
      ).rejects.toThrow('Proposal would remove 1 done/active chapter(s)');
    });
  });

  describe('inserting new chapters before the active chapter', () => {
    it('throws when a new chapter would be inserted at idx 0 and active ends up at idx 1', async () => {
      setupTx(
        [{ id: 'journey-1' }],
        [
          {
            id: 'ch-active-0',
            idx: 0,
            title: 'Active Chapter',
            status: 'active',
          },
        ],
      );

      // new chapter at idx 0, active pushed to idx 1
      await expect(
        applySyllabusChange({
          userId: 'user-1',
          journeyId: 'journey-1',
          newSyllabus: {
            chapters: [
              { title: 'Brand New Chapter' }, // no id → insert
              { id: 'ch-active-0', title: 'Active Chapter' },
            ],
          },
        }),
      ).rejects.toThrow();
    });

    it('throws when a new chapter is inserted between done chapters, before the active chapter', async () => {
      setupTx(
        [{ id: 'journey-1' }],
        [
          { id: 'ch-done-0', idx: 0, title: 'Done One', status: 'done' },
          { id: 'ch-done-1', idx: 1, title: 'Done Two', status: 'done' },
          {
            id: 'ch-active-2',
            idx: 2,
            title: 'Active Chapter',
            status: 'active',
          },
        ],
      );

      // new chapter squeezed at idx 1 (between the two done chapters);
      // active ends up at idx 3
      await expect(
        applySyllabusChange({
          userId: 'user-1',
          journeyId: 'journey-1',
          newSyllabus: {
            chapters: [
              { id: 'ch-done-0', title: 'Done One' },
              { title: 'Inserted Chapter' }, // no id → insert, ends up at idx 1
              { id: 'ch-done-1', title: 'Done Two' },
              { id: 'ch-active-2', title: 'Active Chapter' },
            ],
          },
        }),
      ).rejects.toThrow();
    });

    it('does not throw when new chapters are all inserted after the active chapter', async () => {
      setupTx([{ id: 'journey-1' }], existingChapters);

      await expect(
        applySyllabusChange({
          userId: 'user-1',
          journeyId: 'journey-1',
          newSyllabus: {
            chapters: [
              { id: 'ch-active-0', title: 'Active Chapter' },
              { id: 'ch-locked-1', title: 'Locked Chapter' },
              { title: 'Brand New Chapter' }, // insert after active → ok
            ],
          },
        }),
      ).resolves.not.toThrow();
    });
  });

  describe('renaming done chapters', () => {
    it('does not update the title of a done chapter even when the proposal carries a new title', async () => {
      const mockTx = setupTx(
        [{ id: 'journey-1' }],
        [
          {
            id: 'ch-done-0',
            idx: 0,
            title: 'Original Done Title',
            status: 'done',
          },
          {
            id: 'ch-active-1',
            idx: 1,
            title: 'Active Chapter',
            status: 'active',
          },
        ],
      );

      await applySyllabusChange({
        userId: 'user-1',
        journeyId: 'journey-1',
        newSyllabus: {
          chapters: [
            { id: 'ch-done-0', title: 'Renamed Done Title' }, // rename attempt
            { id: 'ch-active-1', title: 'Active Chapter' },
          ],
        },
      });

      // The update calls for preserved chapters should never set the done
      // chapter's title to the new value.
      const setCalls = mockTx.update.set.mock.calls as Array<
        [Record<string, unknown>]
      >;
      const titlesWritten = setCalls
        .map(([args]) => args.title)
        .filter((t) => t !== undefined);

      expect(titlesWritten).not.toContain('Renamed Done Title');
    });

    it('does allow renaming a locked chapter', async () => {
      const mockTx = setupTx([{ id: 'journey-1' }], existingChapters);

      await applySyllabusChange({
        userId: 'user-1',
        journeyId: 'journey-1',
        newSyllabus: {
          chapters: [
            { id: 'ch-active-0', title: 'Active Chapter' },
            { id: 'ch-locked-1', title: 'Locked Renamed' },
          ],
        },
      });

      const setCalls = mockTx.update.set.mock.calls as Array<
        [Record<string, unknown>]
      >;
      const titlesWritten = setCalls
        .map(([args]) => args.title)
        .filter((t) => t !== undefined);

      expect(titlesWritten).toContain('Locked Renamed');
    });
  });

  describe('happy path', () => {
    it('returns the active chapter idx and title after a no-op reorder', async () => {
      setupTx([{ id: 'journey-1' }], existingChapters);

      const result = await applySyllabusChange({
        userId: 'user-1',
        journeyId: 'journey-1',
        newSyllabus: {
          chapters: [
            { id: 'ch-active-0', title: 'Active Chapter' },
            { id: 'ch-locked-1', title: 'Locked Chapter' },
          ],
        },
      });

      expect(result).toEqual({
        currentChapter: { idx: 0, title: 'Active Chapter' },
      });
    });

    it('returns updated idx when the active chapter is reordered to a later position', async () => {
      setupTx([{ id: 'journey-1' }], existingChapters);

      const result = await applySyllabusChange({
        userId: 'user-1',
        journeyId: 'journey-1',
        newSyllabus: {
          chapters: [
            { id: 'ch-locked-1', title: 'Locked Chapter' },
            { id: 'ch-active-0', title: 'Active Chapter' },
          ],
        },
      });

      expect(result).toEqual({
        currentChapter: { idx: 1, title: 'Active Chapter' },
      });
    });

    it('returns updated title when the active chapter is renamed', async () => {
      setupTx([{ id: 'journey-1' }], existingChapters);

      const result = await applySyllabusChange({
        userId: 'user-1',
        journeyId: 'journey-1',
        newSyllabus: {
          chapters: [
            { id: 'ch-active-0', title: 'Renamed Active Chapter' },
            { id: 'ch-locked-1', title: 'Locked Chapter' },
          ],
        },
      });

      expect(result).toEqual({
        currentChapter: { idx: 0, title: 'Renamed Active Chapter' },
      });
    });

    it('runs inside a transaction', async () => {
      setupTx([{ id: 'journey-1' }], existingChapters);

      await applySyllabusChange({
        userId: 'user-1',
        journeyId: 'journey-1',
        newSyllabus: {
          chapters: [{ id: 'ch-active-0', title: 'Active Chapter' }],
        },
      });

      expect(transactionImpl).toHaveBeenCalledOnce();
    });

    it('deletes removed locked chapters', async () => {
      const mockTx = setupTx([{ id: 'journey-1' }], existingChapters);

      await applySyllabusChange({
        userId: 'user-1',
        journeyId: 'journey-1',
        newSyllabus: {
          // ch-locked-1 is intentionally omitted — it should be deleted
          chapters: [{ id: 'ch-active-0', title: 'Active Chapter' }],
        },
      });

      expect(mockTx.delete.where).toHaveBeenCalledOnce();
    });

    it('does not call delete when no locked chapters are removed', async () => {
      const mockTx = setupTx([{ id: 'journey-1' }], existingChapters);

      await applySyllabusChange({
        userId: 'user-1',
        journeyId: 'journey-1',
        newSyllabus: {
          chapters: [
            { id: 'ch-active-0', title: 'Active Chapter' },
            { id: 'ch-locked-1', title: 'Locked Chapter' },
          ],
        },
      });

      expect(mockTx.delete).not.toHaveBeenCalled();
    });
  });
});
