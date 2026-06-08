import type { ToolExecutionOptions } from 'ai';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createUpdateSyllabusDraftTool } from './tool';

vi.mock('@/lib/server/journeys/updateSyllabus', () => ({
  updateJourneySyllabus: vi.fn(),
}));

import { updateJourneySyllabus } from '@/lib/server/journeys/updateSyllabus';

const mockUpdateJourneySyllabus = vi.mocked(updateJourneySyllabus);

const execOpts: ToolExecutionOptions = { toolCallId: 'tc1', messages: [] };

function assertDefined<T>(value: T | undefined): asserts value is T {
  if (value === undefined) {
    throw new Error('Expected defined');
  }
}

describe('createUpdateSyllabusDraftTool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpdateJourneySyllabus.mockResolvedValue(undefined);
  });

  describe('execute', () => {
    it('calls updateJourneySyllabus with the correct owner and journey', async () => {
      const syllabus = { chapters: [{ title: 'Intro' }] };

      const { execute } = createUpdateSyllabusDraftTool({
        userId: 'u1',
        journeyId: 'j1',
      });

      assertDefined(execute);
      await execute(syllabus, execOpts);

      expect(mockUpdateJourneySyllabus).toHaveBeenCalledExactlyOnceWith({
        userId: 'u1',
        journeyId: 'j1',
        syllabus,
      });
    });

    it('returns { ok: true } on success', async () => {
      const { execute } = createUpdateSyllabusDraftTool({
        userId: 'u1',
        journeyId: 'j1',
      });

      assertDefined(execute);
      const result = await execute({ chapters: [] }, execOpts);

      expect(result).toEqual({ ok: true });
    });
  });
});
