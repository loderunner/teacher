'use client';

import { useTranslations } from 'next-intl';

import { JourneyChatView, useJourneyChat } from '@/lib/journey-chat';
import type { Journey, JourneyChapter } from '@/lib/server/journeys/get';

/** Props for {@link ChapterChat}. */
type Props = {
  /** The current journey, used for routing the API request. */
  journey: Journey;
  /** The chapter the learner is viewing. */
  chapter: JourneyChapter;
};

/**
 * Client island that drives the chapter-chat phase.
 * Streams responses from `/api/journeys/[id]/chapters/[chapterId]/chat`.
 * The `updateMemory` tool is silent — no delegate needed.
 */
export function ChapterChat({ journey, chapter }: Props) {
  const t = useTranslations('ChapterChat');
  const { messages, status, handleSubmit } = useJourneyChat({
    api: `/api/journeys/${journey.id}/chapters/${chapter.id}/chat`,
  });

  return (
    <JourneyChatView
      messages={messages}
      placeholder={t('promptPlaceholder')}
      status={status}
      onSubmit={handleSubmit}
    />
  );
}
