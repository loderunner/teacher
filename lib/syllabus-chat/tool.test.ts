import assert from 'node:assert';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createUpdateSyllabusDraftTool } from './tool';

import { updateDraftSyllabus } from '@/lib/server/journeys/update-draft';

vi.mock('ai', () => ({ tool: (config: unknown) => config }));
vi.mock('@/lib/server/syllabus/schema', () => ({ syllabusSchema: {} }));
vi.mock('@/lib/server/journeys/update-draft', () => ({
  updateDraftSyllabus: vi.fn(),
}));

const mockUpdateDraftSyllabus = vi.mocked(updateDraftSyllabus);

describe('createUpdateSyllabusDraftTool', () => {
  beforeEach(() => {
    mockUpdateDraftSyllabus.mockReset();
  });

  it('returns a tool with execute and description', () => {
    const toolInstance = createUpdateSyllabusDraftTool({
      journeyId: 'journey-1',
    });
    expect(toolInstance).toBeTruthy();
    expect(typeof toolInstance.execute).toBe('function');
    expect(toolInstance.description).toContain(
      'Replace the entire syllabus draft',
    );
  });

  it('execute persists the draft for the bound journey', async () => {
    mockUpdateDraftSyllabus.mockResolvedValueOnce(undefined);
    const toolInstance = createUpdateSyllabusDraftTool({
      journeyId: 'journey-42',
    });
    const { execute } = toolInstance;
    assert(execute !== undefined);

    const draft = {
      chapters: [{ title: 'Foundations', summary: 'Basics.' }],
    };
    const result = await execute(
      { draft },
      { toolCallId: 'call-1', messages: [] },
    );

    expect(result).toEqual({ ok: true });
    expect(mockUpdateDraftSyllabus).toHaveBeenCalledExactlyOnceWith({
      journeyId: 'journey-42',
      syllabus: draft,
    });
  });
});
