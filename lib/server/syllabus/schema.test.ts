import { describe, expect, it } from 'vitest';

import { chapterSchema, syllabusSchema } from './schema';

describe('chapterSchema', () => {
  describe('valid inputs', () => {
    it('accepts a chapter with only a title', () => {
      const result = chapterSchema.safeParse({ title: 'Introduction' });
      expect(result.success).toBe(true);
    });

    it('accepts a chapter with all fields populated', () => {
      const result = chapterSchema.safeParse({
        title: 'Introduction',
        summary: 'An overview of the chapter.',
        sections: ['Basics', 'Advanced topics'],
      });
      expect(result.success).toBe(true);
    });
  });

  describe('title validation', () => {
    it('rejects an empty title', () => {
      const result = chapterSchema.safeParse({ title: '' });
      expect(result.success).toBe(false);
    });

    it('rejects a title longer than 120 characters', () => {
      const result = chapterSchema.safeParse({ title: 'A'.repeat(121) });
      expect(result.success).toBe(false);
    });

    it('accepts a title of exactly 120 characters', () => {
      const result = chapterSchema.safeParse({ title: 'A'.repeat(120) });
      expect(result.success).toBe(true);
    });
  });

  describe('summary validation', () => {
    it('rejects a summary longer than 800 characters', () => {
      const result = chapterSchema.safeParse({
        title: 'Introduction',
        summary: 'A'.repeat(801),
      });
      expect(result.success).toBe(false);
    });

    it('accepts a summary of exactly 800 characters', () => {
      const result = chapterSchema.safeParse({
        title: 'Introduction',
        summary: 'A'.repeat(800),
      });
      expect(result.success).toBe(true);
    });
  });

  describe('sections validation', () => {
    it('rejects a section item longer than 200 characters', () => {
      const result = chapterSchema.safeParse({
        title: 'Introduction',
        sections: ['A'.repeat(201)],
      });
      expect(result.success).toBe(false);
    });

    it('rejects more than 20 sections', () => {
      const result = chapterSchema.safeParse({
        title: 'Introduction',
        sections: Array.from({ length: 21 }, (_, i) => `Section ${i + 1}`),
      });
      expect(result.success).toBe(false);
    });

    it('accepts exactly 20 sections', () => {
      const result = chapterSchema.safeParse({
        title: 'Introduction',
        sections: Array.from({ length: 20 }, (_, i) => `Section ${i + 1}`),
      });
      expect(result.success).toBe(true);
    });
  });
});

describe('syllabusSchema', () => {
  it('accepts an empty chapters array', () => {
    const result = syllabusSchema.safeParse({ chapters: [] });
    expect(result.success).toBe(true);
  });

  it('accepts a chapters array with valid chapters', () => {
    const result = syllabusSchema.safeParse({
      chapters: [
        { title: 'Chapter 1' },
        { title: 'Chapter 2', summary: 'A summary.' },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('rejects more than 30 chapters', () => {
    const result = syllabusSchema.safeParse({
      chapters: Array.from({ length: 31 }, (_, i) => ({
        title: `Chapter ${i + 1}`,
      })),
    });
    expect(result.success).toBe(false);
  });

  it('accepts exactly 30 chapters', () => {
    const result = syllabusSchema.safeParse({
      chapters: Array.from({ length: 30 }, (_, i) => ({
        title: `Chapter ${i + 1}`,
      })),
    });
    expect(result.success).toBe(true);
  });
});
