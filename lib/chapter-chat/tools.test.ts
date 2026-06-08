import type { ToolExecutionOptions } from 'ai';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { generateChapterSummary } from './complete';
import { createMarkChapterCompleteTool } from './tools';

import { completeChapter } from '@/lib/server/chapters/complete';

vi.mock('./complete', () => ({ generateChapterSummary: vi.fn() }));
vi.mock('@/lib/server/chapters/complete', () => ({ completeChapter: vi.fn() }));
vi.mock('@/lib/server/journeys/appendMemories', () => ({
  appendJourneyMemories: vi.fn(),
}));

const mockGenerateChapterSummary = vi.mocked(generateChapterSummary);
const mockCompleteChapter = vi.mocked(completeChapter);

const execOpts: ToolExecutionOptions = { toolCallId: 'tc1', messages: [] };

const style = {
  id: 'teacher',
  systemPromptFragments: { en: 'teach', fr: 'enseigner' },
} as never;

const chapter = {
  id: 'ch1',
  idx: 0,
  title: 'Intro',
  status: 'active' as const,
  summary: null,
};

const nextChapter = {
  id: 'ch2',
  idx: 1,
  title: 'Basics',
  status: 'locked' as const,
  summary: null,
};

const journey = {
  id: 'j1',
  title: 'My Journey',
  styleId: 'teacher',
  memory: [],
  status: 'active' as const,
  syllabus: { chapters: [] },
  chapters: [chapter, nextChapter],
};

function assertDefined<T>(value: T | undefined): asserts value is T {
  if (value === undefined) {
    throw new Error('Expected defined');
  }
}

describe('createMarkChapterCompleteTool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGenerateChapterSummary.mockResolvedValue('Summary text');
    mockCompleteChapter.mockResolvedValue({ nextIdx: 1 });
  });

  describe('execute', () => {
    it('generates a summary with the provided style, locale, chapter, and messages', async () => {
      const messages = [
        {
          id: 'm1',
          role: 'user' as const,
          parts: [{ type: 'text' as const, text: 'Hello' }],
        },
      ] as never;

      const { execute } = createMarkChapterCompleteTool({
        userId: 'u1',
        journey,
        chapter,
        messages,
        style,
        locale: 'en',
      });

      assertDefined(execute);
      await execute({}, execOpts);

      expect(mockGenerateChapterSummary).toHaveBeenCalledExactlyOnceWith({
        style,
        locale: 'en',
        chapter,
        messages,
      });
    });

    it('completes the chapter with the generated summary', async () => {
      mockGenerateChapterSummary.mockResolvedValue('Generated summary');

      const { execute } = createMarkChapterCompleteTool({
        userId: 'u1',
        journey,
        chapter,
        messages: [] as never,
        style,
        locale: 'en',
      });

      assertDefined(execute);
      await execute({}, execOpts);

      expect(mockCompleteChapter).toHaveBeenCalledExactlyOnceWith({
        userId: 'u1',
        journeyId: 'j1',
        idx: 0,
        summary: 'Generated summary',
      });
    });

    it('returns the next chapter path when there is a next chapter', async () => {
      mockCompleteChapter.mockResolvedValue({ nextIdx: 1 });

      const { execute } = createMarkChapterCompleteTool({
        userId: 'u1',
        journey,
        chapter,
        messages: [] as never,
        style,
        locale: 'en',
      });

      assertDefined(execute);
      const result = await execute({}, execOpts);

      expect(result).toHaveProperty('nextChapterPath');
      expect(
        (result as { nextChapterPath: string | null }).nextChapterPath,
      ).toMatch(/\/journeys\/.+\/2-basics-ch2/);
    });

    it('returns null nextChapterPath when there is no next chapter', async () => {
      mockCompleteChapter.mockResolvedValue({ nextIdx: null });

      const { execute } = createMarkChapterCompleteTool({
        userId: 'u1',
        journey,
        chapter,
        messages: [] as never,
        style,
        locale: 'en',
      });

      assertDefined(execute);
      const result = await execute({}, execOpts);

      expect(result).toHaveProperty('nextChapterPath', null);
    });

    it('returns null nextChapterPath when nextIdx points to a chapter not in the journey list', async () => {
      mockCompleteChapter.mockResolvedValue({ nextIdx: 99 });

      const { execute } = createMarkChapterCompleteTool({
        userId: 'u1',
        journey,
        chapter,
        messages: [] as never,
        style,
        locale: 'en',
      });

      assertDefined(execute);
      const result = await execute({}, execOpts);

      expect(result).toHaveProperty('nextChapterPath', null);
    });
  });
});
