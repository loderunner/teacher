import { describe, expect, it } from 'vitest';

import { syllabusChatRequestSchema } from './syllabus';

const userMessage = {
  id: 'u1',
  role: 'user',
  parts: [{ type: 'text', text: 'Hello' }],
};

describe('syllabusChatRequestSchema', () => {
  it('parses a message submission', () => {
    const result = syllabusChatRequestSchema.safeParse({
      locale: 'en',
      message: userMessage,
    });

    expect(result.success).toBe(true);
  });

  it('parses a regeneration request', () => {
    const result = syllabusChatRequestSchema.safeParse({
      locale: 'fr',
      regenerateFromMessageId: 'a1',
    });

    expect(result.success).toBe(true);
  });

  it('parses a request with both message and regenerateFromMessageId', () => {
    // Schema allows both — the handler enforces mutual exclusion
    const result = syllabusChatRequestSchema.safeParse({
      locale: 'en',
      message: userMessage,
      regenerateFromMessageId: 'a1',
    });

    expect(result.success).toBe(true);
  });

  it('parses a request with neither message nor regenerateFromMessageId', () => {
    // Schema allows neither — the handler enforces "at least one" constraint
    const result = syllabusChatRequestSchema.safeParse({ locale: 'en' });

    expect(result.success).toBe(true);
  });

  it('rejects an empty regenerateFromMessageId', () => {
    const result = syllabusChatRequestSchema.safeParse({
      locale: 'en',
      regenerateFromMessageId: '',
    });

    expect(result.success).toBe(false);
  });

  it('rejects an unsupported locale', () => {
    const result = syllabusChatRequestSchema.safeParse({
      locale: 'de',
      message: userMessage,
    });

    expect(result.success).toBe(false);
  });

  it('rejects a missing locale', () => {
    const result = syllabusChatRequestSchema.safeParse({
      message: userMessage,
    });

    expect(result.success).toBe(false);
  });

  it('rejects extra fields (.strict())', () => {
    const result = syllabusChatRequestSchema.safeParse({
      locale: 'en',
      message: userMessage,
      unknown: 'field',
    });

    expect(result.success).toBe(false);
  });
});
