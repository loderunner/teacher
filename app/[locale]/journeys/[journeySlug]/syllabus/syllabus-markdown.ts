import type { Syllabus } from '@/lib/syllabus/schema';

/**
 * Formats an activated journey's syllabus as Markdown for read-only display at
 * the bottom of the syllabus-chat transcript.
 *
 * Each chapter becomes a numbered heading followed by its overview paragraph
 * and a bullet list of its sections.
 *
 * @param syllabus The complete syllabus to render.
 * @returns A Markdown string with one section per chapter.
 *
 * @example
 * formatSyllabusMarkdown({
 *   chapters: [{ title: 'Intro', overview: 'Basics.', sections: ['Setup'] }],
 * });
 * // "### 1. Intro\n\nBasics.\n\n- Setup"
 */
export function formatSyllabusMarkdown(syllabus: Syllabus): string {
  return syllabus.chapters
    .map((chapter, index) => {
      const heading = `##### ${index + 1}. ${chapter.title}`;
      const sections = chapter.sections
        .map((section) => `- ${section}`)
        .join('\n');
      return [heading, chapter.overview, sections].join('\n\n');
    })
    .join('\n\n');
}
