import { useTranslations } from 'next-intl';

import { ChapterChat } from './chapter-chat';
import { StyleLabel } from './style-label';
import { SyllabusPanel } from './syllabus-panel';

import { ChatPageShell } from '@/components/chat-page-shell';
import type { Journey, JourneyChapter } from '@/lib/server/journeys/get';

type Props = {
  journey: Journey;
  chapter: JourneyChapter;
};

export function ChapterPage({ journey, chapter }: Props) {
  const t = useTranslations('Chapter');

  return (
    <ChatPageShell>
      <ChatPageShell.Content>
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
          <div className="flex flex-col gap-1">
            <p className="text-muted-foreground text-sm">
              {t('position', {
                n: chapter.idx + 1,
                total: journey.chapters.length,
              })}
            </p>
            <h1 className="text-3xl font-bold">{chapter.title}</h1>
          </div>
        </div>
        <ChapterChat chapter={chapter} journey={journey} />
      </ChatPageShell.Content>
      <ChatPageShell.Sidebar>
        <SyllabusPanel currentIdx={chapter.idx} journey={journey} />
        <StyleLabel styleId={journey.styleId} />
      </ChatPageShell.Sidebar>
    </ChatPageShell>
  );
}
