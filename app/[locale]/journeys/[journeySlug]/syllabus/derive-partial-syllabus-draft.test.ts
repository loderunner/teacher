import { type UIMessage } from 'ai';
import { describe, expect, it } from 'vitest';

import { derivePartialSyllabusDraft } from './derive-partial-syllabus-draft';

const chapters = [{ title: 'One', overview: '', sections: ['Overview'] }];

describe('derivePartialSyllabusDraft', () => {
  it('returns null when the last message is not from the assistant', () => {
    const messages: UIMessage[] = [
      { id: 'u1', role: 'user', parts: [{ type: 'text', text: 'Hi' }] },
    ];

    expect(derivePartialSyllabusDraft(messages)).toBeNull();
  });

  it('returns the parsed draft while input is streaming', () => {
    const messages: UIMessage[] = [
      {
        id: 'a1',
        role: 'assistant',
        parts: [
          {
            type: 'tool-updateSyllabusDraft',
            toolCallId: 't1',
            state: 'input-streaming',
            input: { chapters },
          },
        ],
      },
    ];

    expect(derivePartialSyllabusDraft(messages)).toEqual({ chapters });
  });

  it('returns the parsed draft once input is available', () => {
    const messages: UIMessage[] = [
      {
        id: 'a1',
        role: 'assistant',
        parts: [
          {
            type: 'tool-updateSyllabusDraft',
            toolCallId: 't1',
            state: 'input-available',
            input: { chapters },
          },
        ],
      },
    ];

    expect(derivePartialSyllabusDraft(messages)).toEqual({ chapters });
  });

  it('returns the parsed draft once output is available', () => {
    const messages: UIMessage[] = [
      {
        id: 'a1',
        role: 'assistant',
        parts: [
          {
            type: 'tool-updateSyllabusDraft',
            toolCallId: 't1',
            state: 'output-available',
            input: { chapters },
            output: undefined,
          },
        ],
      },
    ];

    expect(derivePartialSyllabusDraft(messages)).toEqual({ chapters });
  });

  it('returns null on output-error with no input', () => {
    const messages: UIMessage[] = [
      {
        id: 'a1',
        role: 'assistant',
        parts: [
          {
            type: 'tool-updateSyllabusDraft',
            toolCallId: 't1',
            state: 'output-error',
            input: undefined,
            errorText: 'boom',
          },
        ],
      },
    ];

    expect(derivePartialSyllabusDraft(messages)).toBeNull();
  });

  it('finds the tool part when trailing prose follows it', () => {
    const messages: UIMessage[] = [
      {
        id: 'a1',
        role: 'assistant',
        parts: [
          {
            type: 'tool-updateSyllabusDraft',
            toolCallId: 't1',
            state: 'output-available',
            input: { chapters },
            output: undefined,
          },
          { type: 'text', text: 'Here is the syllabus so far...' },
        ],
      },
    ];

    expect(derivePartialSyllabusDraft(messages)).toEqual({ chapters });
  });

  it('returns the latest draft when the tool is called more than once', () => {
    const firstChapters = [
      { title: 'First', overview: '', sections: ['Overview'] },
    ];
    const messages: UIMessage[] = [
      {
        id: 'a1',
        role: 'assistant',
        parts: [
          {
            type: 'tool-updateSyllabusDraft',
            toolCallId: 't1',
            state: 'output-available',
            input: { chapters: firstChapters },
            output: undefined,
          },
          { type: 'text', text: 'Adding another chapter...' },
          {
            type: 'tool-updateSyllabusDraft',
            toolCallId: 't2',
            state: 'output-available',
            input: { chapters },
            output: undefined,
          },
        ],
      },
    ];

    expect(derivePartialSyllabusDraft(messages)).toEqual({ chapters });
  });

  it('does not fall back to an earlier call when the latest one has no input', () => {
    const messages: UIMessage[] = [
      {
        id: 'a1',
        role: 'assistant',
        parts: [
          {
            type: 'tool-updateSyllabusDraft',
            toolCallId: 't1',
            state: 'output-available',
            input: { chapters },
            output: undefined,
          },
          {
            type: 'tool-updateSyllabusDraft',
            toolCallId: 't2',
            state: 'output-error',
            input: undefined,
            errorText: 'boom',
          },
        ],
      },
    ];

    expect(derivePartialSyllabusDraft(messages)).toBeNull();
  });
});
