'use client';

import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState, useTransition } from 'react';

import { completeChapterAction } from './complete-chapter';
import { StyleLabel } from './style-label';
import { SyllabusPanel } from './syllabus-panel';

import { ChatPageShell } from '@/components/chat-page-shell';
import { useRouter } from '@/i18n/navigation';
import { JourneyChatView, useJourneyChat } from '@/lib/journey-chat';
import type { Journey, JourneyChapter } from '@/lib/server/journeys/get';

type Props = {
  journey: Journey;
  chapter: JourneyChapter;
};

export function ChapterPage({ journey, chapter }: Props) {
  const t = useTranslations('Chapter');
  const tChat = useTranslations('ChapterChat');
  const router = useRouter();

  const { messages, status, handleSubmit, triggerResponse } = useJourneyChat({
    api: `/api/journeys/${journey.id}/chapters/${chapter.id}/chat`,
  });

  const startedRef = useRef(false);
  useEffect(() => {
    if (startedRef.current) {
      return;
    }
    startedRef.current = true;
    triggerResponse();
  }, [triggerResponse]);

  const [completing, startCompleting] = useTransition();
  const [completeError, setCompleteError] = useState<string | null>(null);

  const chapterComplete = messages.some(
    (m) =>
      m.role === 'assistant' &&
      m.parts.some((p) => p.type === 'tool-markChapterComplete'),
  );

  const lastChapter = chapter.idx === journey.chapters.length - 1;
  const completeLabel = lastChapter
    ? tChat('completeJourney')
    : tChat('completeChapter');

  const handleComplete = useCallback(() => {
    startCompleting(async () => {
      try {
        setCompleteError(null);
        const result = await completeChapterAction({
          journeyId: journey.id,
          chapterIdx: chapter.idx,
          messages,
        });
        if (result.nextChapterPath !== null) {
          router.push(result.nextChapterPath);
        } else {
          router.refresh();
        }
      } catch {
        setCompleteError(tChat('completeError'));
      }
    });
  }, [journey.id, chapter.idx, router, tChat, messages]);

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
        <JourneyChatView
          messages={messages}
          placeholder={tChat('promptPlaceholder')}
          status={status}
          onSubmit={handleSubmit}
        />
      </ChatPageShell.Content>
      <ChatPageShell.Sidebar>
        <SyllabusPanel currentIdx={chapter.idx} journey={journey} />
        <StyleLabel styleId={journey.styleId} />
        {chapterComplete && (
          <div>
            {completeError !== null && (
              <p className="text-destructive mb-2 text-sm">{completeError}</p>
            )}
            <button
              className="border-foreground bg-foreground text-background w-full rounded border px-4 py-2 text-sm font-medium transition-opacity disabled:opacity-40"
              disabled={completing}
              type="button"
              onClick={handleComplete}
            >
              {completeLabel}
            </button>
          </div>
        )}
      </ChatPageShell.Sidebar>
    </ChatPageShell>
  );
}
