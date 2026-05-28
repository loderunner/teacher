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

  it('extracts title, summary, and sections from a fully-valid tool input', () => {
    const chapters = [
      {
        title: 'Introduction',
        summary: 'A gentle overview of the subject.',
        sections: ['What you will learn', 'Prerequisites'],
      },
      {
        title: 'Advanced Topics',
        summary: 'Deep dive into edge cases.',
        sections: ['Technique A', 'Technique B', 'Putting it together'],
      },
    ];
    const messages = [assistantWithTool({ chapters })];

    const { draft, partialDraft } = deriveSyllabusDraftsFromMessages(messages);

    expect(draft).toEqual({ chapters });
    expect(partialDraft).toEqual({ chapters });
  });

  it('extracts chapters with only the required title field', () => {
    const messages = [
      assistantWithTool({ chapters: [{ title: 'Intro' }, { title: 'Advanced' }] }),
    ];

    const { draft, partialDraft } = deriveSyllabusDraftsFromMessages(messages);

    expect(draft).toEqual({ chapters: [{ title: 'Intro' }, { title: 'Advanced' }] });
    expect(partialDraft).toEqual({ chapters: [{ title: 'Intro' }, { title: 'Advanced' }] });
  });

  it('falls back to the previous fully-valid draft when the latest input is mid-stream', () => {
    const oldChapter = {
      title: 'Old Chapter',
      summary: 'The original content.',
      sections: ['Section A', 'Section B'],
    };
    const messages = [
      assistantWithTool({ chapters: [oldChapter] }),
      assistantWithTool({}, 'input-streaming'),
    ];

    const { draft, partialDraft } = deriveSyllabusDraftsFromMessages(messages);

    expect(draft).toEqual({ chapters: [oldChapter] });
    expect(partialDraft).toEqual({});
  });

  it('returns partialDraft = null when the latest input does not even partially validate', () => {
    const messages = [
      assistantWithTool({ chapters: 'not-an-array' }, 'input-streaming'),
    ];

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
