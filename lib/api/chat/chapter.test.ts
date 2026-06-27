import { describe, expect, it } from 'vitest';

import { chapterChatRequestSchema } from './chapter';

const userMessage = {
  id: 'u1',
  role: 'user',
  parts: [{ type: 'text', text: 'Hello' }],
};

describe('chapterChatRequestSchema', () => {
  it('parses a start signal (locale only)', () => {
    const result = chapterChatRequestSchema.safeParse({ locale: 'en' });

    expect(result.success).toBe(true);
  });

  it('parses a message submission', () => {
    const result = chapterChatRequestSchema.safeParse({
      locale: 'en',
      message: userMessage,
    });

    expect(result.success).toBe(true);
  });

  it('parses a regeneration request', () => {
    const result = chapterChatRequestSchema.safeParse({
      locale: 'fr',
      regenerateFromMessageId: 'a1',
    });

    expect(result.success).toBe(true);
  });

  it('parses a request with both message and regenerateFromMessageId', () => {
    // Schema allows both — the handler enforces mutual exclusion
    const result = chapterChatRequestSchema.safeParse({
      locale: 'en',
      message: userMessage,
      regenerateFromMessageId: 'a1',
    });

    expect(result.success).toBe(true);
  });

  it('rejects an empty regenerateFromMessageId', () => {
    const result = chapterChatRequestSchema.safeParse({
      locale: 'en',
      regenerateFromMessageId: '',
    });

    expect(result.success).toBe(false);
  });

  it('rejects an unsupported locale', () => {
    const result = chapterChatRequestSchema.safeParse({
      locale: 'de',
      message: userMessage,
    });

    expect(result.success).toBe(false);
  });

  it('rejects a missing locale', () => {
    const result = chapterChatRequestSchema.safeParse({
      message: userMessage,
    });

    expect(result.success).toBe(false);
  });

  it('rejects extra fields (.strict())', () => {
    const result = chapterChatRequestSchema.safeParse({
      locale: 'en',
      unknown: 'field',
    });

    expect(result.success).toBe(false);
  });
});
