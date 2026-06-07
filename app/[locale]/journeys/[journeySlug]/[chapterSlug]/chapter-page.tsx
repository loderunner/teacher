'use client';

import type { UIMessage } from 'ai';
import { useTranslations } from 'next-intl';
import {
  type ComponentType,
  useEffect,
  useRef,
  useState,
  useTransition,
} from 'react';

import { completeChapterAction } from './complete-chapter';
import { SyllabusChangeCard } from './syllabus-change-card';
import { SyllabusChangeContext } from './syllabus-change-context';

import { Button, ChatPageShell, Title } from '@/components/chat-page';
import { StyleLabel, SyllabusPanel } from '@/components/journey';
import { usePathname, useRouter } from '@/i18n/navigation';
import {
  type ChatMessageMetadata,
  JourneyChatView,
  useJourneyChat,
} from '@/lib/journey-chat';
import type { Journey, JourneyChapter } from '@/lib/server/journeys/get';

const CHAPTER_TOOLS: Record<string, ComponentType> = {
  'tool-proposeSyllabusChange': SyllabusChangeCard,
};

type Props = {
  journey: Journey;
  chapter: JourneyChapter;
  initialMessages: UIMessage<ChatMessageMetadata>[];
};

export function ChapterPage({ journey, chapter, initialMessages }: Props) {
  const t = useTranslations('Chapter');
  const tChat = useTranslations('ChapterChat');
  const router = useRouter();
  const pathname = usePathname();

  const {
    messages,
    setMessages,
    status,
    stop,
    handleSubmit,
    handleRegenerate,
    handleEditMessage,
    triggerResponse,
  } = useJourneyChat({
    api: `/api/journeys/${journey.id}/chapters/${chapter.id}/chat`,
    initialMessages,
  });

  const [appliedToolCallIds, setAppliedToolCallIds] = useState(
    () => new Set<string>(),
  );

  const handleSyllabusApplied = (toolCallId: string) => {
    setAppliedToolCallIds((prev) => new Set(prev).add(toolCallId));
    setMessages((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        role: 'user',
        metadata: {
          action: 'syllabusChangeApplied',
        } satisfies ChatMessageMetadata,
        parts: [{ type: 'text', text: tChat('proposalAppliedMessage') }],
      },
    ]);
    triggerResponse();
  };

  useEffect(
    () => () => {
      stop();
    },
    [stop],
  );

  const triggeredRef = useRef(false);
  useEffect(() => {
    if (triggeredRef.current) {
      return;
    }
    triggeredRef.current = true;
    const last = initialMessages.at(-1);
    if (last !== undefined && last.role !== 'user') {
      return;
    }
    triggerResponse();
    // Only the initial state matters; later changes are handled by submit/regenerate.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const handleComplete = () => {
    startCompleting(async () => {
      try {
        setCompleteError(null);
        const result = await completeChapterAction({
          journeyId: journey.id,
          chapterIdx: chapter.idx,
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
  };

  return (
    <ChatPageShell.Root>
      <ChatPageShell.Content>
        <ChatPageShell.Header>
          <p className="text-muted-foreground text-sm">
            {t('position', {
              n: chapter.idx + 1,
              total: journey.chapters.length,
            })}
          </p>
          <Title>{chapter.title}</Title>
        </ChatPageShell.Header>

        <SyllabusChangeContext.Provider
          value={{
            journey,
            currentPath: pathname,
            appliedToolCallIds,
            onApplied: handleSyllabusApplied,
          }}
        >
          <JourneyChatView
            messages={messages}
            placeholder={tChat('promptPlaceholder')}
            status={status}
            tools={CHAPTER_TOOLS}
            onEditUserMessage={(messageId, text) =>
              handleEditMessage({ messageId, text })
            }
            onRegenerate={(messageId) => handleRegenerate({ messageId })}
            onStop={stop}
            onSubmit={handleSubmit}
          />
        </SyllabusChangeContext.Provider>
        {chapterComplete && (
          <>
            {completeError !== null && (
              <p className="text-destructive mx-auto w-full max-w-3xl px-1 text-sm">
                {completeError}
              </p>
            )}
            <ChatPageShell.Footer>
              <Button disabled={completing} onClick={handleComplete}>
                {completeLabel}
              </Button>
            </ChatPageShell.Footer>
          </>
        )}
      </ChatPageShell.Content>
      <ChatPageShell.Sidebar>
        <SyllabusPanel
          current={{ type: 'chapter', idx: chapter.idx }}
          journey={journey}
          mode="activated"
        />
        <StyleLabel styleId={journey.styleId} />
      </ChatPageShell.Sidebar>
    </ChatPageShell.Root>
  );
}
