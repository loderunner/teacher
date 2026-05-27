import type { UIMessage } from 'ai';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { bootstrapJourney } from './bootstrap';

const { mockGenerateText } = vi.hoisted(() => ({
  mockGenerateText: vi.fn(),
}));

vi.mock('ai', () => ({
  Output: { object: vi.fn() },
  generateText: mockGenerateText,
}));

vi.mock('@/lib/ai/model', () => ({
  getModel: () => 'anthropic/claude-sonnet-4-6',
}));

describe('bootstrapJourney', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the title and memory from the AI output', async () => {
    mockGenerateText.mockImplementationOnce(async () => ({
      output: { title: 'Test Title', memory: ['Test memory'] },
    }));

    const messages: UIMessage[] = [
      { role: 'user', parts: [{ type: 'text', text: 'Hello' }] } as UIMessage,
    ];
    const draft = { chapters: [] };

    const result = await bootstrapJourney({ draft, messages, locale: 'en' });

    expect(result).toEqual({ title: 'Test Title', memory: ['Test memory'] });
  });

  it('builds the transcript as "role: text" lines joined by newlines', async () => {
    mockGenerateText.mockImplementationOnce(async () => ({
      output: { title: 'T', memory: ['M'] },
    }));

    const messages: UIMessage[] = [
      { role: 'user', parts: [{ type: 'text', text: 'Hello' }] } as UIMessage,
      {
        role: 'assistant',
        parts: [{ type: 'text', text: 'Hi there' }],
      } as UIMessage,
    ];
    const draft = { chapters: [] };

    await bootstrapJourney({ draft, messages, locale: 'en' });

    const { prompt } = mockGenerateText.mock.calls[0][0];
    expect(prompt).toContain('user: Hello\nassistant: Hi there');
  });

  it('passes the correct model to generateText', async () => {
    mockGenerateText.mockImplementationOnce(async () => ({
      output: { title: 'T', memory: ['M'] },
    }));

    const messages: UIMessage[] = [
      { role: 'user', parts: [{ type: 'text', text: 'Hi' }] } as UIMessage,
    ];
    const draft = { chapters: [] };

    await bootstrapJourney({ draft, messages, locale: 'en' });

    expect(mockGenerateText).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ model: 'anthropic/claude-sonnet-4-6' }),
    );
  });

  it('includes the locale-specific bootstrap instructions in the prompt', async () => {
    mockGenerateText.mockImplementationOnce(async () => ({
      output: { title: 'T', memory: ['M'] },
    }));

    const messages: UIMessage[] = [
      { role: 'user', parts: [{ type: 'text', text: 'Hi' }] } as UIMessage,
    ];
    const draft = { chapters: [] };

    await bootstrapJourney({ draft, messages, locale: 'en' });

    const { prompt } = mockGenerateText.mock.calls[0][0];
    expect(prompt).toContain('You are generating metadata to initialise');
  });

  it('includes the serialized syllabus draft as JSON in the prompt', async () => {
    mockGenerateText.mockImplementationOnce(async () => ({
      output: { title: 'T', memory: ['M'] },
    }));

    const messages: UIMessage[] = [
      { role: 'user', parts: [{ type: 'text', text: 'Hi' }] } as UIMessage,
    ];
    const draft = {
      chapters: [{ title: 'Intro', sections: ['Overview'] }],
    };

    await bootstrapJourney({ draft, messages, locale: 'en' });

    const { prompt } = mockGenerateText.mock.calls[0][0];
    expect(prompt).toContain(JSON.stringify(draft, null, 2));
  });
});
