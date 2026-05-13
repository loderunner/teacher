import { describe, expect, it, vi } from 'vitest';

vi.mock('ai', () => ({ tool: (config: unknown) => config }));
vi.mock('@/lib/server/syllabus/schema', () => ({ syllabusSchema: {} }));

import { updateSyllabusDraft } from './tool';

describe('updateSyllabusDraft', () => {
  it('is defined', () => {
    expect(updateSyllabusDraft).toBeTruthy();
  });

  it('has an execute function', () => {
    expect(typeof updateSyllabusDraft.execute).toBe('function');
  });

  it('execute resolves to { ok: true }', async () => {
    const { execute } = updateSyllabusDraft;
    if (execute === undefined) {
      expect.fail('execute is undefined');
      return;
    }
    const result = await execute(
      { draft: { chapters: [] } },
      { toolCallId: 'test-call', messages: [] },
    );
    expect(result).toEqual({ ok: true });
  });

  it('description contains "Replace the entire syllabus draft"', () => {
    expect(updateSyllabusDraft.description).toContain(
      'Replace the entire syllabus draft',
    );
  });
});
