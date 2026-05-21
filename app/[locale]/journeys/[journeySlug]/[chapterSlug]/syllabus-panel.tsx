import { CheckIcon } from '@phosphor-icons/react/dist/ssr';
import { useTranslations } from 'next-intl';

import { Link } from '@/i18n/navigation';
import type { Journey, JourneyChapter } from '@/lib/server/journeys/get';
import { chapterPath, journeyPath } from '@/lib/url';

type Props = {
  journey: Journey;
  currentIdx: number;
};

type ChapterItemProps = {
  journey: Journey;
  chapter: JourneyChapter;
  current: boolean;
};

function ChapterItem({ journey, chapter, current }: ChapterItemProps) {
  const label = `${chapter.idx + 1}. ${chapter.title}`;

  if (current) {
    return (
      <li className="bg-muted rounded px-2 py-1 text-sm font-bold">{label}</li>
    );
  }

  if (chapter.status === 'done') {
    return (
      <li>
        <Link
          className="flex items-center gap-1.5 rounded px-2 py-1 text-sm hover:underline"
          href={chapterPath(journey, chapter)}
        >
          <CheckIcon size={12} />
          {label}
        </Link>
      </li>
    );
  }

  if (chapter.status === 'active') {
    return (
      <li>
        <Link
          className="rounded px-2 py-1 text-sm hover:underline"
          href={chapterPath(journey, chapter)}
        >
          {label}
        </Link>
      </li>
    );
  }

  return (
    <li className="text-muted-foreground px-2 py-1 text-sm">
      <span>{label}</span>
    </li>
  );
}

/** Sidebar syllabus panel for the chapter page — links to unlocked chapters. */
export function SyllabusPanel({ journey, currentIdx }: Props) {
  const t = useTranslations('Chapter');

  return (
    <section className="flex min-h-0 flex-1 flex-col rounded-lg border">
      <h2 className="font-heading border-b p-4 font-semibold">
        {t('syllabusHeader')}
      </h2>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <ol className="flex flex-col">
          {journey.hasSyllabusChat ? (
            <li>
              <Link
                className="rounded px-2 py-1 text-sm hover:underline"
                href={`${journeyPath(journey.id, journey.title)}/syllabus`}
              >
                <span className="font-medium">{t('syllabusChat')}</span>
                <span className="text-muted-foreground block text-xs">
                  {t('syllabusChapterLabel')}
                </span>
              </Link>
            </li>
          ) : null}
          {journey.chapters.map((chapter) => (
            <ChapterItem
              key={chapter.id}
              chapter={chapter}
              current={chapter.idx === currentIdx}
              journey={journey}
            />
          ))}
        </ol>
      </div>
    </section>
  );
}
