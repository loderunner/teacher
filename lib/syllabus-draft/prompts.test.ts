import { describe, expect, it } from 'vitest';

import { composeSyllabusSystemPrompt } from './prompts';

const mockStyleEN = {
  id: 'test-style',
  systemPromptFragments: {
    en: 'Test EN fragment',
    fr: 'Test FR fragment',
  },
};

describe('composeSyllabusSystemPrompt', () => {
  it('returns a string that starts with the style fragment for the en locale', () => {
    const result = composeSyllabusSystemPrompt({
      style: mockStyleEN,
      locale: 'en',
    });
    expect(result.startsWith('Test EN fragment')).toBe(true);
  });

  it('returns a string that starts with the style fragment for the fr locale', () => {
    const result = composeSyllabusSystemPrompt({
      style: mockStyleEN,
      locale: 'fr',
    });
    expect(result.startsWith('Test FR fragment')).toBe(true);
  });

  it('includes the syllabus phase instructions for the en locale', () => {
    const result = composeSyllabusSystemPrompt({
      style: mockStyleEN,
      locale: 'en',
    });
    expect(result).toContain('You are co-authoring a Syllabus');
  });

  it('includes the syllabus phase instructions for the fr locale', () => {
    const result = composeSyllabusSystemPrompt({
      style: mockStyleEN,
      locale: 'fr',
    });
    expect(result).toContain('Vous co-rédigez un Syllabus');
  });

  it('joins the fragment and syllabus phase with \\n\\n', () => {
    const result = composeSyllabusSystemPrompt({
      style: mockStyleEN,
      locale: 'en',
    });
    expect(result).toContain('Test EN fragment\n\n');
  });

  it('joins the fragment and syllabus phase with \\n\\n for the fr locale', () => {
    const result = composeSyllabusSystemPrompt({
      style: mockStyleEN,
      locale: 'fr',
    });
    expect(result).toContain('Test FR fragment\n\n');
  });
});
