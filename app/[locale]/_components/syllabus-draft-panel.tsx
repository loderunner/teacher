import { useTranslations } from 'next-intl';

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import type { Syllabus } from '@/lib/server/syllabus/schema';

type Props = {
  draft: Syllabus | null;
};

type ChapterItemProps = {
  index: number;
  chapter: Syllabus['chapters'][number];
  emptySectionsLabel: string;
};

function ChapterItem({ index, chapter, emptySectionsLabel }: ChapterItemProps) {
  const sections =
    chapter.sections !== undefined && chapter.sections.length > 0 ? (
      <ul className="ml-4 flex flex-col gap-0.5">
        {chapter.sections.map((section, j) => (
          <li key={j} className="text-muted-foreground list-disc text-xs">
            {section}
          </li>
        ))}
      </ul>
    ) : (
      <p className="text-muted-foreground text-xs italic">
        {emptySectionsLabel}
      </p>
    );

  return (
    <AccordionItem value={`chapter-${index}`}>
      <AccordionTrigger>
        <div className="flex flex-1 flex-col gap-1 pr-2">
          <span className="text-sm font-medium">
            {index + 1}. {chapter.title}
          </span>
          {chapter.summary !== undefined && (
            <span className="text-muted-foreground text-xs font-normal">
              {chapter.summary}
            </span>
          )}
        </div>
      </AccordionTrigger>
      <AccordionContent>{sections}</AccordionContent>
    </AccordionItem>
  );
}

export function SyllabusDraftPanel({ draft }: Props) {
  const t = useTranslations('Welcome');

  const empty = draft === null || draft.chapters.length === 0;

  const draftContent = empty ? (
    <p className="text-muted-foreground text-sm">{t('emptyDraft')}</p>
  ) : (
    <Accordion className="flex flex-col">
      {draft.chapters.map((chapter, i) => (
        <ChapterItem
          key={i}
          chapter={chapter}
          emptySectionsLabel={t('emptyChapterSections')}
          index={i}
        />
      ))}
    </Accordion>
  );

  return (
    <section className="flex min-h-0 flex-1 flex-col rounded-lg border">
      <h2 className="font-heading border-b p-4 font-semibold">
        {t('draftHeader')}
      </h2>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">{draftContent}</div>
    </section>
  );
}
