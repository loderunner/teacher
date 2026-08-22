import { describe, expect, it } from 'vitest';

import { formatSyllabusMarkdown } from './syllabus-markdown';

describe('formatSyllabusMarkdown', () => {
  it('renders a single chapter as a numbered heading, overview, and sections', () => {
    const markdown = formatSyllabusMarkdown({
      chapters: [
        { title: 'Intro', overview: 'Basics.', sections: ['Setup', 'Hello'] },
      ],
    });

    expect(markdown).toBe('##### 1. Intro\n\nBasics.\n\n- Setup\n- Hello');
  });

  it('numbers chapters sequentially and joins them with blank lines', () => {
    const markdown = formatSyllabusMarkdown({
      chapters: [
        { title: 'One', overview: 'First.', sections: ['a'] },
        { title: 'Two', overview: 'Second.', sections: ['b'] },
      ],
    });

    expect(markdown).toBe(
      '##### 1. One\n\nFirst.\n\n- a\n\n##### 2. Two\n\nSecond.\n\n- b',
    );
  });
});
