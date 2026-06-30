import { describe, expect, it } from 'vitest';

import {
  chapterSchema,
  partialChapterSchema,
  partialSyllabusSchema,
  syllabusSchema,
} from './schema';

describe('chapterSchema', () => {
  describe('valid inputs', () => {
    it('rejects a chapter with only a title', () => {
      const result = chapterSchema.safeParse({ title: 'Introduction' });
      expect(result.success).toBe(false);
    });

    it('accepts a chapter with all required fields', () => {
      const result = chapterSchema.safeParse({
        title: 'Introduction',
        summary: 'An overview of the chapter.',
        sections: ['Basics', 'Advanced topics'],
      });
      expect(result.success).toBe(true);
    });

    it('accepts a chapter with an empty summary', () => {
      const result = chapterSchema.safeParse({
        title: 'Introduction',
        summary: '',
        sections: ['Overview'],
      });
      expect(result.success).toBe(true);
    });
  });

  describe('title validation', () => {
    it('rejects an empty title', () => {
      const result = chapterSchema.safeParse({
        title: '',
        summary: '',
        sections: ['Overview'],
      });
      expect(result.success).toBe(false);
    });

    it('rejects a title longer than 120 characters', () => {
      const result = chapterSchema.safeParse({
        title: 'A'.repeat(121),
        summary: '',
        sections: ['Overview'],
      });
      expect(result.success).toBe(false);
    });

    it('accepts a title of exactly 120 characters', () => {
      const result = chapterSchema.safeParse({
        title: 'A'.repeat(120),
        summary: '',
        sections: ['Overview'],
      });
      expect(result.success).toBe(true);
    });
  });

  describe('summary validation', () => {
    it('rejects a summary longer than 800 characters', () => {
      const result = chapterSchema.safeParse({
        title: 'Introduction',
        summary: 'A'.repeat(801),
        sections: ['Overview'],
      });
      expect(result.success).toBe(false);
    });

    it('accepts a summary of exactly 800 characters', () => {
      const result = chapterSchema.safeParse({
        title: 'Introduction',
        summary: 'A'.repeat(800),
        sections: ['Overview'],
      });
      expect(result.success).toBe(true);
    });
  });

  describe('sections validation', () => {
    it('rejects a section item longer than 200 characters', () => {
      const result = chapterSchema.safeParse({
        title: 'Introduction',
        summary: '',
        sections: ['A'.repeat(201)],
      });
      expect(result.success).toBe(false);
    });

    it('rejects more than 20 sections', () => {
      const result = chapterSchema.safeParse({
        title: 'Introduction',
        summary: '',
        sections: Array.from({ length: 21 }, (_, i) => `Section ${i + 1}`),
      });
      expect(result.success).toBe(false);
    });

    it('accepts exactly 20 sections', () => {
      const result = chapterSchema.safeParse({
        title: 'Introduction',
        summary: '',
        sections: Array.from({ length: 20 }, (_, i) => `Section ${i + 1}`),
      });
      expect(result.success).toBe(true);
    });

    it('rejects an empty sections array', () => {
      const result = chapterSchema.safeParse({
        title: 'Introduction',
        summary: '',
        sections: [],
      });
      expect(result.success).toBe(false);
    });
  });
});

describe('syllabusSchema', () => {
  it('rejects an empty chapters array', () => {
    const result = syllabusSchema.safeParse({ chapters: [] });
    expect(result.success).toBe(false);
  });

  it('accepts a chapters array with valid chapters', () => {
    const result = syllabusSchema.safeParse({
      chapters: [
        { title: 'Chapter 1', summary: 'First.', sections: ['Overview'] },
        { title: 'Chapter 2', summary: 'Second.', sections: ['Overview'] },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('rejects more than 30 chapters', () => {
    const result = syllabusSchema.safeParse({
      chapters: Array.from({ length: 31 }, (_, i) => ({
        title: `Chapter ${i + 1}`,
        summary: '',
        sections: ['Overview'],
      })),
    });
    expect(result.success).toBe(false);
  });

  it('accepts exactly 30 chapters', () => {
    const result = syllabusSchema.safeParse({
      chapters: Array.from({ length: 30 }, (_, i) => ({
        title: `Chapter ${i + 1}`,
        summary: '',
        sections: ['Overview'],
      })),
    });
    expect(result.success).toBe(true);
  });
});

describe('partialSyllabusSchema', () => {
  it('accepts an empty object while streaming has not started', () => {
    const result = partialSyllabusSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('accepts an empty chapters array', () => {
    const result = partialSyllabusSchema.safeParse({ chapters: [] });
    expect(result.success).toBe(true);
  });

  it('accepts a chapter with only a title', () => {
    const result = partialSyllabusSchema.safeParse({
      chapters: [{ title: 'Introduction' }],
    });
    expect(result.success).toBe(true);
  });

  it('accepts a chapter with an empty sections array', () => {
    const result = partialSyllabusSchema.safeParse({
      chapters: [{ title: 'Introduction', sections: [] }],
    });
    expect(result.success).toBe(true);
  });

  it('accepts a chapter with an empty title', () => {
    const result = partialSyllabusSchema.safeParse({
      chapters: [{ title: '' }],
    });
    expect(result.success).toBe(true);
  });

  it('rejects more than 30 chapters', () => {
    const result = partialSyllabusSchema.safeParse({
      chapters: Array.from({ length: 31 }, () => ({ title: 'Chapter' })),
    });
    expect(result.success).toBe(false);
  });
});

describe('partial schema parity with full schema', () => {
  it('partial chapter schema exposes the same keys as chapterSchema', () => {
    expect(Object.keys(partialChapterSchema.shape).toSorted()).toEqual(
      Object.keys(chapterSchema.shape).toSorted(),
    );
  });

  it('partial syllabus schema exposes the same keys as syllabusSchema', () => {
    expect(Object.keys(partialSyllabusSchema.shape).toSorted()).toEqual(
      Object.keys(syllabusSchema.shape).toSorted(),
    );
  });

  it('accepts every syllabus that syllabusSchema accepts', () => {
    const complete = {
      chapters: [
        {
          title: 'Chapter 1',
          summary: 'First.',
          sections: ['Overview'],
        },
        {
          id: 'abc123',
          title: 'Chapter 2',
          summary: '',
          sections: ['Part A', 'Part B'],
        },
      ],
    };

    const full = syllabusSchema.safeParse(complete);
    const partial = partialSyllabusSchema.safeParse(complete);

    expect(full.success).toBe(true);
    expect(partial.success).toBe(true);
    if (full.success && partial.success) {
      expect(partial.data).toEqual(full.data);
    }
  });
});
