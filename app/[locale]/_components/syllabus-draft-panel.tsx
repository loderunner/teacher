'use client';

import { useTranslations } from 'next-intl';

import type { Syllabus } from '@/lib/server/syllabus/schema';

type Props = {
  draft: Syllabus | null;
};

export function SyllabusDraftPanel({ draft }: Props) {
  const t = useTranslations('Welcome');

  return (
    <div className="flex h-full flex-col gap-4 rounded-lg border p-4">
      <h2 className="font-semibold">{t('draftHeader')}</h2>
      {draft === null || draft.chapters.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('emptyDraft')}</p>
      ) : (
        <ol className="flex flex-col gap-3">
          {draft.chapters.map((chapter, i) => (
            <li key={i} className="flex flex-col gap-1">
              <span className="text-sm font-medium">
                {i + 1}. {chapter.title}
              </span>
              {chapter.summary !== undefined && (
                <span className="text-xs text-muted-foreground">
                  {chapter.summary}
                </span>
              )}
              {chapter.sections !== undefined &&
                chapter.sections.length > 0 && (
                  <ul className="ml-4 flex flex-col gap-0.5">
                    {chapter.sections.map((section, j) => (
                      <li
                        key={j}
                        className="text-xs text-muted-foreground list-disc"
                      >
                        {section}
                      </li>
                    ))}
                  </ul>
                )}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
