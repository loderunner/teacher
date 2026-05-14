import assert from 'node:assert';

import { describe, expect, it, vi } from 'vitest';

import { updateSyllabusDraft } from './tool';

vi.mock('ai', () => ({ tool: (config: unknown) => config }));
vi.mock('@/lib/server/syllabus/schema', () => ({ syllabusSchema: {} }));

describe('updateSyllabusDraft', () => {
  it('is defined', () => {
    expect(updateSyllabusDraft).toBeTruthy();
  });

  it('has an execute function', () => {
    expect(typeof updateSyllabusDraft.execute).toBe('function');
  });

  it('execute resolves to { ok: true }', async () => {
    const { execute } = updateSyllabusDraft;
    expect(execute).toBeDefined();
    assert(execute !== undefined);

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
