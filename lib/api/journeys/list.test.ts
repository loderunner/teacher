import { describe, expect, it } from 'vitest';

import { journeySummarySchema, listJourneysResponseSchema } from './list';

const validSummary = {
  id: 'abc1234567',
  title: 'Test Journey',
  styleId: 'teacher',
  status: 'active' as const,
  chapterCount: 5,
  currentChapterNumber: 3,
  updatedAt: new Date('2024-01-01T00:00:00.000Z'),
};

describe('journeySummarySchema', () => {
  it('parses a valid active journey summary', () => {
    const result = journeySummarySchema.parse(validSummary);

    expect(result.id).toBe('abc1234567');
    expect(result.status).toBe('active');
    expect(result.currentChapterNumber).toBe(3);
    expect(result.updatedAt).toBeInstanceOf(Date);
  });

  it('parses a drafting journey with null currentChapterNumber', () => {
    const result = journeySummarySchema.parse({
      ...validSummary,
      status: 'drafting',
      chapterCount: 0,
      currentChapterNumber: null,
    });

    expect(result.status).toBe('drafting');
    expect(result.currentChapterNumber).toBeNull();
  });

  it('coerces an ISO date string for updatedAt to a Date', () => {
    const result = journeySummarySchema.parse({
      ...validSummary,
      updatedAt: '2024-06-15T12:30:00.000Z',
    });

    expect(result.updatedAt).toBeInstanceOf(Date);
    expect(result.updatedAt.toISOString()).toBe('2024-06-15T12:30:00.000Z');
  });

  it('rejects extra fields (.strict())', () => {
    const result = journeySummarySchema.safeParse({
      ...validSummary,
      unknownField: 'x',
    });

    expect(result.success).toBe(false);
  });

  it('rejects an invalid status value', () => {
    const result = journeySummarySchema.safeParse({
      ...validSummary,
      status: 'archived',
    });

    expect(result.success).toBe(false);
  });

  it('rejects a negative chapterCount', () => {
    const result = journeySummarySchema.safeParse({
      ...validSummary,
      chapterCount: -1,
    });

    expect(result.success).toBe(false);
  });
});

describe('listJourneysResponseSchema', () => {
  it('parses a response with items and a nextPageToken', () => {
    const result = listJourneysResponseSchema.parse({
      items: [validSummary],
      nextPageToken: 'token123',
    });

    expect(result.items).toHaveLength(1);
    expect(result.nextPageToken).toBe('token123');
  });

  it('parses a last-page response (no nextPageToken)', () => {
    const result = listJourneysResponseSchema.parse({
      items: [validSummary],
    });

    expect(result.items).toHaveLength(1);
    expect(result.nextPageToken).toBeUndefined();
  });

  it('parses an empty items array', () => {
    const result = listJourneysResponseSchema.parse({ items: [] });

    expect(result.items).toHaveLength(0);
  });

  it('rejects extra fields (.strict())', () => {
    const result = listJourneysResponseSchema.safeParse({
      items: [],
      extra: 'field',
    });

    expect(result.success).toBe(false);
  });
});
