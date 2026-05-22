import { type DeepPartial } from 'ai';

import type { Journey } from '@/lib/server/journeys/get';
import type { Chapter, Syllabus } from '@/lib/server/syllabus/schema';
import { chapterPath } from '@/lib/url';

/** Normalized chapter row used by {@link SyllabusPanel} for rendering. */
export type DisplayChapter = {
  title: string | undefined;
  summary: string | undefined;
  sections: string[] | undefined;
  status: 'draft' | 'locked' | 'active' | 'done';
  /** `undefined` in draft mode and for locked chapters in activated mode. */
  href: string | undefined;
  current: boolean;
};

/** Identifies which item in the panel is currently active (activated mode only). */
export type Current = { type: 'syllabus' } | { type: 'chapter'; idx: number };

/** Converts a partial draft syllabus into {@link DisplayChapter} rows. */
export function buildDraftChapters(
  draft: DeepPartial<Syllabus> | null,
): DisplayChapter[] {
  return (draft?.chapters ?? [])
    .filter(
      (c): c is DeepPartial<Chapter> =>
        c !== undefined && c.title !== undefined,
    )
    .map((c) => ({
      title: c.title,
      summary: c.summary,
      sections: c.sections?.filter((s): s is string => s !== undefined),
      status: 'draft' as const,
      href: undefined,
      current: false,
    }));
}

/** Converts an activated journey's chapters into {@link DisplayChapter} rows. */
export function buildActivatedChapters(
  journey: Journey,
  current: Current,
): DisplayChapter[] {
  return journey.chapters.map((chapter, i) => {
    const syllabusChapter =
      i < journey.syllabus.chapters.length
        ? journey.syllabus.chapters[i]
        : undefined;
    return {
      title: chapter.title,
      summary: syllabusChapter?.summary,
      sections: syllabusChapter?.sections,
      status: chapter.status,
      href:
        chapter.status !== 'locked' ? chapterPath(journey, chapter) : undefined,
      current: current.type === 'chapter' && chapter.idx === current.idx,
    };
  });
}
