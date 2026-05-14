import { useTranslations } from 'next-intl';

import { ChapterChat } from './chapter-chat';
import { StylePickerPersist } from './style-picker-persist';
import { SyllabusPanel } from './syllabus-panel';

import { ChatPageShell } from '@/components/chat-page-shell';
import type { Journey, JourneyChapter } from '@/lib/server/journeys/get';
import type { Style } from '@/lib/server/styles/get';

type Props = {
  journey: Journey;
  chapter: JourneyChapter;
  presets: Style[];
};

export function ChapterPage({ journey, chapter, presets }: Props) {
  const t = useTranslations('Chapter');

  return (
    <ChatPageShell>
      <ChatPageShell.Content>
        <div className="flex flex-col gap-1">
          <p className="text-muted-foreground text-sm">
            {t('position', {
              n: chapter.idx + 1,
              total: journey.chapters.length,
            })}
          </p>
          <h1 className="text-3xl font-bold">{chapter.title}</h1>
        </div>
        <ChapterChat chapter={chapter} journey={journey} />
      </ChatPageShell.Content>
      <ChatPageShell.Sidebar>
        <SyllabusPanel currentIdx={chapter.idx} journey={journey} />
        <StylePickerPersist
          initialStyleId={journey.styleId}
          journeyId={journey.id}
          presets={presets}
        />
      </ChatPageShell.Sidebar>
    </ChatPageShell>
  );
}
