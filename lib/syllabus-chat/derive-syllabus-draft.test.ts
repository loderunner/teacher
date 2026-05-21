import type { UIMessage } from 'ai';
import { describe, expect, it } from 'vitest';

import { deriveSyllabusDraftsFromMessages } from './derive-syllabus-draft';

function assistantWithTool(input: unknown, state = 'output-available') {
  return {
    id: 'a',
    role: 'assistant',
    parts: [
      {
        type: 'tool-updateSyllabusDraft',
        toolCallId: 'tc',
        state,
        input,
      },
    ],
  } as unknown as UIMessage;
}

const userMessage: UIMessage = {
  id: 'u',
  role: 'user',
  parts: [{ type: 'text', text: 'hi' }],
};

describe('deriveSyllabusDraftsFromMessages', () => {
  it('returns nulls when there are no tool parts', () => {
    expect(deriveSyllabusDraftsFromMessages([userMessage])).toEqual({
      draft: null,
      partialDraft: null,
    });
  });

  it('returns both draft and partialDraft from a fully-valid tool input', () => {
    const messages = [
      assistantWithTool({
        draft: { chapters: [{ title: 'Intro' }, { title: 'Advanced' }] },
      }),
    ];

    const { draft, partialDraft } = deriveSyllabusDraftsFromMessages(messages);

    expect(draft).toEqual({
      chapters: [{ title: 'Intro' }, { title: 'Advanced' }],
    });
    expect(partialDraft).toEqual({
      chapters: [{ title: 'Intro' }, { title: 'Advanced' }],
    });
  });

  it('falls back to the previous fully-valid draft when the latest input is mid-stream', () => {
    const messages = [
      assistantWithTool({
        draft: { chapters: [{ title: 'Old' }] },
      }),
      assistantWithTool({ draft: {} }, 'input-streaming'),
    ];

    const { draft, partialDraft } = deriveSyllabusDraftsFromMessages(messages);

    expect(draft).toEqual({ chapters: [{ title: 'Old' }] });
    expect(partialDraft).toEqual({});
  });

  it('returns partialDraft = null when the latest input does not even partially validate', () => {
    const messages = [
      assistantWithTool({ draft: 'not-an-object' }, 'input-streaming'),
    ];

    expect(deriveSyllabusDraftsFromMessages(messages)).toEqual({
      draft: null,
      partialDraft: null,
    });
  });

  it('ignores tool parts whose input has no draft field', () => {
    const messages = [assistantWithTool({ wrong: 'shape' })];
    expect(deriveSyllabusDraftsFromMessages(messages)).toEqual({
      draft: null,
      partialDraft: null,
    });
  });

  it('ignores non-assistant messages', () => {
    expect(deriveSyllabusDraftsFromMessages([userMessage])).toEqual({
      draft: null,
      partialDraft: null,
    });
  });
});
