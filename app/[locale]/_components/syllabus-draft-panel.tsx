'use client';

import { useTranslations } from 'next-intl';

import type { Syllabus } from '@/lib/server/syllabus/schema';

type Props = {
  draft: Syllabus | null;
};

type ChapterItemProps = {
  index: number;
  chapter: Syllabus['chapters'][number];
};

function ChapterItem({ index, chapter }: ChapterItemProps) {
  const sections =
    chapter.sections !== undefined && chapter.sections.length > 0 ? (
      <ul className="ml-4 flex flex-col gap-0.5">
        {chapter.sections.map((section, j) => (
          <li key={j} className="list-disc text-xs text-muted-foreground">
            {section}
          </li>
        ))}
      </ul>
    ) : null;

  return (
    <li className="flex flex-col gap-1">
      <span className="text-sm font-medium">
        {index + 1}. {chapter.title}
      </span>
      {chapter.summary !== undefined && (
        <span className="text-xs text-muted-foreground">{chapter.summary}</span>
      )}
      {sections}
    </li>
  );
}

export function SyllabusDraftPanel({ draft }: Props) {
  const t = useTranslations('Welcome');

  const draftContent =
    draft === null || draft.chapters.length === 0 ? (
      <p className="text-sm text-muted-foreground">{t('emptyDraft')}</p>
    ) : (
      <ol className="flex flex-col gap-3">
        {draft.chapters.map((chapter, i) => (
          <ChapterItem key={i} chapter={chapter} index={i} />
        ))}
      </ol>
    );

  return (
    <div className="flex h-full flex-col gap-4 rounded-lg border p-4">
      <h2 className="font-semibold">{t('draftHeader')}</h2>
      {draftContent}
    </div>
  );
}
