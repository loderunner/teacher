import { useTranslations } from 'next-intl';

import { StylePickerPersist } from './style-picker-persist';

import type { Journey } from '@/lib/server/journeys/get';
import type { Style } from '@/lib/server/styles/get';


type Props = {
  journey: Journey;
  presets: Style[];
};

type ChapterItemProps = {
  chapter: Journey['chapters'][number];
  label: string | null;
};

function ChapterItem({ chapter, label }: ChapterItemProps) {
  return (
    <li className="flex flex-col gap-1">
      <div className="flex items-center justify-between gap-4">
        <span className="font-medium">
          {chapter.idx + 1}. {chapter.title}
        </span>
        {label !== null && (
          <span className="text-sm text-muted-foreground">{label}</span>
        )}
      </div>
      {chapter.summary !== null && (
        <p className="text-sm text-muted-foreground">{chapter.summary}</p>
      )}
    </li>
  );
}

export function JourneyHome({ journey, presets }: Props) {
  const t = useTranslations('Journey');

  return (
    <main className="flex flex-1 flex-col gap-8 p-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold">{journey.title}</h1>
        <StylePickerPersist
          initialStyleId={journey.styleId}
          journeyId={journey.id}
          presets={presets}
        />
      </div>

      <section className="flex flex-col gap-4">
        <h2 className="text-xl font-semibold">{t('syllabusHeader')}</h2>
        <ol className="flex flex-col gap-4">
          {journey.chapters.map((chapter) => (
            <ChapterItem
              key={chapter.id}
              chapter={chapter}
              label={
                chapter.status === 'active'
                  ? t('beginChapter', { n: chapter.idx + 1 })
                  : null
              }
            />
          ))}
        </ol>
      </section>
    </main>
  );
}
