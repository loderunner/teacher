import { type ChainMock, chainMock } from 'chain-mock';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { applySyllabusChange } from './applySyllabusChange';

const { transactionImpl } = vi.hoisted(() => ({
  transactionImpl: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  db: chainMock(),
  dbTx: { transaction: transactionImpl },
}));

/** Shape of a `chapters` row as loaded by the function under test. */
type ChapterRow = {
  id: string;
  idx: number;
  title: string;
  status: string;
  overview: string;
  sections: string[];
};

const activeRow: ChapterRow = {
  id: 'ch-active-0',
  idx: 0,
  title: 'Active Chapter',
  status: 'active',
  overview: 'Existing overview',
  sections: ['Existing section'],
};

const lockedRow: ChapterRow = {
  id: 'ch-locked-1',
  idx: 1,
  title: 'Locked Chapter',
  status: 'locked',
  overview: 'Existing overview',
  sections: ['Existing section'],
};

const doneRow: ChapterRow = {
  id: 'ch-done-0',
  idx: 0,
  title: 'Done Chapter',
  status: 'done',
  overview: 'Done overview',
  sections: ['Done section'],
};

const activeAfterDoneRow: ChapterRow = {
  id: 'ch-active-1',
  idx: 1,
  title: 'Active Chapter',
  status: 'active',
  overview: 'Existing overview',
  sections: ['Existing section'],
};

const existingChapters: ChapterRow[] = [activeRow, lockedRow];

/** Builds a proposal chapter with the required overview and sections fields. */
const ch = (opts: {
  id?: string;
  title: string;
  overview?: string;
  sections?: string[];
}) => ({
  overview: 'New overview',
  sections: ['New section'],
  ...opts,
});

/**
 * Builds a proposal chapter that carries a row's content forward unchanged —
 * what a well-behaved proposal does for done and active chapters, whose
 * overview and sections are protected from rewrites.
 */
const keep = (row: ChapterRow, overrides: { title?: string } = {}) => ({
  id: row.id,
  title: row.title,
  overview: row.overview,
  sections: row.sections,
  ...overrides,
});

/** Sets up a transaction mock that returns the given journey and chapter rows. */
const setupTx = (
  journeyRows: { id: string }[],
  chapterRows: ChapterRow[],
): ChainMock => {
  const mockTx = chainMock();
  mockTx.select.from.where.mockResolvedValueOnce(journeyRows);
  mockTx.select.from.where.orderBy.mockResolvedValueOnce(chapterRows);
  transactionImpl.mockImplementationOnce(
    (cb: (tx: ChainMock) => Promise<unknown>) => cb(mockTx),
  );
  return mockTx;
};

/** Every object passed to `tx.update(...).set(...)`, in call order. */
const setArgs = (mockTx: ChainMock): Record<string, unknown>[] =>
  (mockTx.update.set.mock.calls as Array<[Record<string, unknown>]>).map(
    ([args]) => args,
  );

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
          newSyllabus: { chapters: [keep(activeRow)] },
        }),
      ).rejects.toThrow('Journey not found');
    });

    it('throws when there is no active chapter', async () => {
      setupTx(
        [{ id: 'journey-1' }],
        [
          {
            id: 'ch-locked-0',
            idx: 0,
            title: 'Locked',
            status: 'locked',
            overview: '',
            sections: [],
          },
        ],
      );

      await expect(
        applySyllabusChange({
          userId: 'user-1',
          journeyId: 'journey-1',
          newSyllabus: {
            chapters: [ch({ id: 'ch-locked-0', title: 'Locked' })],
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
              keep(activeRow),
              ch({ id: 'ch-unknown-id', title: 'Ghost Chapter' }),
            ],
          },
        }),
      ).rejects.toThrow(
        'Proposal references unknown chapter id: ch-unknown-id',
      );
    });

    it('throws when the proposal removes a done chapter', async () => {
      setupTx([{ id: 'journey-1' }], [doneRow, activeAfterDoneRow]);

      await expect(
        applySyllabusChange({
          userId: 'user-1',
          journeyId: 'journey-1',
          newSyllabus: {
            // ch-done-0 is intentionally omitted — should be rejected
            chapters: [keep(activeAfterDoneRow)],
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
            chapters: [ch({ id: 'ch-locked-1', title: 'Locked Chapter' })],
          },
        }),
      ).rejects.toThrow('Proposal would remove 1 done/active chapter(s)');
    });
  });

  describe('inserting new chapters before the active chapter', () => {
    it('throws when a new chapter would be inserted at idx 0 and active ends up at idx 1', async () => {
      setupTx([{ id: 'journey-1' }], [activeRow]);

      // new chapter at idx 0, active pushed to idx 1
      await expect(
        applySyllabusChange({
          userId: 'user-1',
          journeyId: 'journey-1',
          newSyllabus: {
            chapters: [
              ch({ title: 'Brand New Chapter' }), // no id → insert
              keep(activeRow),
            ],
          },
        }),
      ).rejects.toThrow(
        'Proposal would insert new chapters before the active chapter',
      );
    });

    it('throws when a new chapter is inserted between done chapters, before the active chapter', async () => {
      const doneOne: ChapterRow = { ...doneRow, title: 'Done One' };
      const doneTwo: ChapterRow = {
        ...doneRow,
        id: 'ch-done-1',
        idx: 1,
        title: 'Done Two',
      };
      const active: ChapterRow = { ...activeAfterDoneRow, idx: 2 };
      setupTx([{ id: 'journey-1' }], [doneOne, doneTwo, active]);

      // new chapter squeezed at idx 1 (between the two done chapters);
      // active ends up at idx 3
      await expect(
        applySyllabusChange({
          userId: 'user-1',
          journeyId: 'journey-1',
          newSyllabus: {
            chapters: [
              keep(doneOne),
              ch({ title: 'Inserted Chapter' }), // no id → insert, ends up at idx 1
              keep(doneTwo),
              keep(active),
            ],
          },
        }),
      ).rejects.toThrow(
        'Proposal would insert new chapters before the active chapter',
      );
    });

    it('does not throw when new chapters are all inserted after the active chapter', async () => {
      setupTx([{ id: 'journey-1' }], existingChapters);

      await expect(
        applySyllabusChange({
          userId: 'user-1',
          journeyId: 'journey-1',
          newSyllabus: {
            chapters: [
              keep(activeRow),
              ch({ id: 'ch-locked-1', title: 'Locked Chapter' }),
              ch({ title: 'Brand New Chapter' }), // insert after active → ok
            ],
          },
        }),
      ).resolves.not.toThrow();
    });
  });

  describe('protecting done chapters', () => {
    it('throws when the proposal renames a done chapter', async () => {
      setupTx([{ id: 'journey-1' }], [doneRow, activeAfterDoneRow]);

      await expect(
        applySyllabusChange({
          userId: 'user-1',
          journeyId: 'journey-1',
          newSyllabus: {
            chapters: [
              keep(doneRow, { title: 'Renamed Done Title' }),
              keep(activeAfterDoneRow),
            ],
          },
        }),
      ).rejects.toThrow('Proposal modifies done chapter "Done Chapter"');
    });

    it('throws when the proposal changes a done chapter overview', async () => {
      setupTx([{ id: 'journey-1' }], [doneRow, activeAfterDoneRow]);

      await expect(
        applySyllabusChange({
          userId: 'user-1',
          journeyId: 'journey-1',
          newSyllabus: {
            chapters: [
              { ...keep(doneRow), overview: 'Rewritten overview' },
              keep(activeAfterDoneRow),
            ],
          },
        }),
      ).rejects.toThrow('Proposal modifies done chapter "Done Chapter"');
    });

    it('throws when the proposal changes a done chapter sections', async () => {
      setupTx([{ id: 'journey-1' }], [doneRow, activeAfterDoneRow]);

      await expect(
        applySyllabusChange({
          userId: 'user-1',
          journeyId: 'journey-1',
          newSyllabus: {
            chapters: [
              { ...keep(doneRow), sections: ['Done section', 'Extra section'] },
              keep(activeAfterDoneRow),
            ],
          },
        }),
      ).rejects.toThrow('Proposal modifies done chapter "Done Chapter"');
    });

    it('writes only the new idx for an unchanged done chapter', async () => {
      const mockTx = setupTx(
        [{ id: 'journey-1' }],
        [doneRow, activeAfterDoneRow],
      );

      await applySyllabusChange({
        userId: 'user-1',
        journeyId: 'journey-1',
        newSyllabus: {
          chapters: [keep(doneRow), keep(activeAfterDoneRow)],
        },
      });

      expect(setArgs(mockTx)).toContainEqual({ idx: 0 });
    });
  });

  describe('protecting the active chapter', () => {
    it('throws when the proposal changes the active chapter overview', async () => {
      setupTx([{ id: 'journey-1' }], existingChapters);

      await expect(
        applySyllabusChange({
          userId: 'user-1',
          journeyId: 'journey-1',
          newSyllabus: {
            chapters: [
              { ...keep(activeRow), overview: 'Rewritten overview' },
              keep(lockedRow),
            ],
          },
        }),
      ).rejects.toThrow(
        "Proposal modifies the active chapter's overview or sections",
      );
    });

    it('throws when the proposal changes the active chapter sections', async () => {
      setupTx([{ id: 'journey-1' }], existingChapters);

      await expect(
        applySyllabusChange({
          userId: 'user-1',
          journeyId: 'journey-1',
          newSyllabus: {
            chapters: [
              { ...keep(activeRow), sections: ['A different section'] },
              keep(lockedRow),
            ],
          },
        }),
      ).rejects.toThrow(
        "Proposal modifies the active chapter's overview or sections",
      );
    });

    it('writes only idx and title for the active chapter, never its content', async () => {
      const mockTx = setupTx([{ id: 'journey-1' }], existingChapters);

      await applySyllabusChange({
        userId: 'user-1',
        journeyId: 'journey-1',
        newSyllabus: {
          chapters: [
            keep(activeRow, { title: 'Renamed Active Chapter' }),
            keep(lockedRow),
          ],
        },
      });

      expect(setArgs(mockTx)).toContainEqual({
        idx: 0,
        title: 'Renamed Active Chapter',
      });
    });
  });

  describe('locked chapters', () => {
    it('replaces a locked chapter title, overview, and sections from the proposal', async () => {
      const mockTx = setupTx([{ id: 'journey-1' }], existingChapters);

      await applySyllabusChange({
        userId: 'user-1',
        journeyId: 'journey-1',
        newSyllabus: {
          chapters: [
            keep(activeRow),
            ch({ id: 'ch-locked-1', title: 'Locked Renamed' }),
          ],
        },
      });

      expect(setArgs(mockTx)).toContainEqual({
        idx: 1,
        title: 'Locked Renamed',
        overview: 'New overview',
        sections: ['New section'],
      });
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
            keep(activeRow),
            ch({ id: 'ch-locked-1', title: 'Locked Chapter' }),
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
            ch({ id: 'ch-locked-1', title: 'Locked Chapter' }),
            keep(activeRow),
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
            keep(activeRow, { title: 'Renamed Active Chapter' }),
            ch({ id: 'ch-locked-1', title: 'Locked Chapter' }),
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
        newSyllabus: { chapters: [keep(activeRow)] },
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
          chapters: [keep(activeRow)],
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
            keep(activeRow),
            ch({ id: 'ch-locked-1', title: 'Locked Chapter' }),
          ],
        },
      });

      expect(mockTx.delete).not.toHaveBeenCalled();
    });

    it('inserts new chapters with overview and sections from the proposal', async () => {
      const mockTx = setupTx([{ id: 'journey-1' }], existingChapters);

      await applySyllabusChange({
        userId: 'user-1',
        journeyId: 'journey-1',
        newSyllabus: {
          chapters: [
            keep(activeRow),
            ch({ id: 'ch-locked-1', title: 'Locked Chapter' }),
            ch({ title: 'Brand New Chapter' }), // no id → insert
          ],
        },
      });

      expect(mockTx.insert.values).toHaveBeenCalledExactlyOnceWith([
        expect.objectContaining({
          title: 'Brand New Chapter',
          overview: 'New overview',
          sections: ['New section'],
        }),
      ]);
    });

    it('updates currentChapterIndex without rewriting the syllabus draft', async () => {
      const mockTx = setupTx([{ id: 'journey-1' }], existingChapters);

      await applySyllabusChange({
        userId: 'user-1',
        journeyId: 'journey-1',
        newSyllabus: {
          chapters: [
            ch({ id: 'ch-locked-1', title: 'Locked Chapter' }),
            keep(activeRow),
          ],
        },
      });

      // The chapters rows are the source of truth — reconstructing the blob
      // from a proposal is exactly the drift this function must not cause.
      expect(setArgs(mockTx)).toContainEqual({ currentChapterIndex: 1 });
      for (const args of setArgs(mockTx)) {
        expect(args).not.toHaveProperty('syllabusDraft');
      }
    });
  });
});
