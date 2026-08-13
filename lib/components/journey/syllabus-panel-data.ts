import type { Journey } from '@/lib/journeys/get';
import type {
  PartialChapter,
  PartialSyllabus,
  Syllabus,
} from '@/lib/syllabus/schema';
import { chapterPath } from '@/lib/url';

/** Normalized chapter row used by {@link SyllabusPanel} for rendering. */
export type DisplayChapter = {
  title?: string;
  summary?: string;
  sections?: string[];
  status: 'draft' | 'locked' | 'active' | 'done';
  /** `undefined` in draft mode and for locked chapters in activated mode. */
  href?: string;
};

/** Converts a partial draft syllabus into {@link DisplayChapter} rows. */
export function buildDraftChapters(
  draft: PartialSyllabus | Syllabus | null,
): DisplayChapter[] {
  if (draft === null || draft.chapters === undefined) {
    return [];
  }

  return draft.chapters
    .filter(
      (c): c is PartialChapter & { title: string } => c.title !== undefined,
    )
    .map((c) => ({
      title: c.title,
      summary: c.summary,
      sections: c.sections,
      status: 'draft' as const,
      href: undefined,
    }));
}

/** Converts an activated journey's chapters into {@link DisplayChapter} rows. */
export function buildActivatedChapters(journey: Journey): DisplayChapter[] {
  return journey.chapters.map((chapter, i) => {
    const syllabusChapter =
      journey.syllabus !== null && i < journey.syllabus.chapters.length
        ? journey.syllabus.chapters[i]
        : undefined;
    return {
      title: chapter.title,
      summary: syllabusChapter?.summary,
      sections: syllabusChapter?.sections,
      status: chapter.status,
      href:
        chapter.status !== 'locked' ? chapterPath(journey, chapter) : undefined,
    };
  });
}

/** Accordion item value for the chapter at `index`. */
export function chapterValue(index: number): string {
  return `chapter-${index}`;
}

/** Whether `chapter` has anything to disclose (a summary or non-empty sections). */
export function collapsible(chapter: DisplayChapter): boolean {
  return (
    chapter.summary !== undefined ||
    (chapter.sections !== undefined && chapter.sections.length > 0)
  );
}

/** Item values of every collapsible chapter in `chapters`. */
export function collapsibleChapterValues(chapters: DisplayChapter[]): string[] {
  return chapters
    .map((chapter, i) => ({ chapter, value: chapterValue(i) }))
    .filter(({ chapter }) => collapsible(chapter))
    .map(({ value }) => value);
}
