import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createUpdateSyllabusDraftTool } from './tool';

import { updateSyllabusDraft } from '@/lib/journeys/updateSyllabusDraft';

vi.mock('@/lib/journeys/updateSyllabusDraft');

const mockUpdateSyllabusDraft = vi.mocked(updateSyllabusDraft);

const syllabus = {
  chapters: [
    {
      title: 'Introduction',
      summary: 'Overview of the course.',
      sections: ['What is this?'],
    },
  ],
};

const execContext = { messages: [] as never[], toolCallId: 'tc-1' };

const getExecute = (tool: ReturnType<typeof createUpdateSyllabusDraftTool>) => {
  const { execute } = tool;
  if (execute === undefined) {
    throw new Error('execute is not defined');
  }
  return execute;
};

describe('createUpdateSyllabusDraftTool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('execute', () => {
    it('calls updateSyllabusDraft with the userId, journeyId, and syllabus', async () => {
      mockUpdateSyllabusDraft.mockResolvedValueOnce(undefined);

      const execute = getExecute(
        createUpdateSyllabusDraftTool({
          userId: 'user-1',
          journeyId: 'journey-1',
        }),
      );

      await execute(syllabus, execContext);

      expect(mockUpdateSyllabusDraft).toHaveBeenCalledExactlyOnceWith({
        userId: 'user-1',
        journeyId: 'journey-1',
        syllabus,
      });
    });

    it('returns a success message', async () => {
      mockUpdateSyllabusDraft.mockResolvedValueOnce(undefined);

      const execute = getExecute(
        createUpdateSyllabusDraftTool({
          userId: 'user-1',
          journeyId: 'journey-1',
        }),
      );

      const result = await execute(syllabus, execContext);

      expect(result).toBe('Updated syllabus draft');
    });
  });
});
