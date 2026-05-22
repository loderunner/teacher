'use client';

import { useTranslations } from 'next-intl';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from 'react';
import { z } from 'zod';

import { completeChapterAction } from './complete-chapter';
import { SyllabusChangeCard } from './syllabus-change-card';

import { Button, ChatPageShell, Title } from '@/components/chat-page';
import { StyleLabel, SyllabusPanel } from '@/components/journey';
import { usePathname, useRouter } from '@/i18n/navigation';
import { JourneyChatView, useJourneyChat } from '@/lib/journey-chat';
import type { MessagePartDelegateProps } from '@/lib/journey-chat/view';
import type { Journey, JourneyChapter } from '@/lib/server/journeys/get';
import { syllabusSchema } from '@/lib/server/syllabus/schema';

const proposalInputSchema = z.object({
  reason: z.string(),
  newSyllabus: syllabusSchema,
});

type Props = {
  journey: Journey;
  chapter: JourneyChapter;
};

export function ChapterPage({ journey, chapter }: Props) {
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
  });

  const [appliedToolCallIds, setAppliedToolCallIds] = useState(
    () => new Set<string>(),
  );

  const handleSyllabusApplied = useCallback(
    (toolCallId: string) => {
      setAppliedToolCallIds((prev) => new Set(prev).add(toolCallId));
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: 'user',
          metadata: { type: 'action' },
          parts: [{ type: 'text', text: tChat('proposalAppliedMessage') }],
        },
      ]);
    },
    [setMessages, tChat],
  );

  // Stable component reference — recreated only when journey, pathname, or
  // appliedToolCallIds changes. SyllabusChangeCard local state (applying,
  // dismissed) is preserved across streaming re-renders; the applied state
  // lives here so it survives journey-prop updates after router.refresh().
  const ChapterPartDelegate = useMemo(
    () =>
      function ChapterPartDelegateComponent({
        part,
      }: MessagePartDelegateProps) {
        if (part.type !== 'tool-proposeSyllabusChange') {
          return null;
        }
        const toolCallId = 'toolCallId' in part ? part.toolCallId : '';
        const raw = 'input' in part ? part.input : undefined;
        const parsed = proposalInputSchema.safeParse(raw);
        if (!parsed.success) {
          return null;
        }
        return (
          <SyllabusChangeCard
            applied={appliedToolCallIds.has(toolCallId)}
            currentPath={pathname}
            journey={journey}
            proposal={parsed.data}
            toolCallId={toolCallId}
            onApplied={() => handleSyllabusApplied(toolCallId)}
          />
        );
      },
    [journey, pathname, appliedToolCallIds, handleSyllabusApplied],
  );

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
        <JourneyChatView
          MessagePartDelegate={ChapterPartDelegate}
          messages={messages}
          placeholder={tChat('promptPlaceholder')}
          status={status}
          onEditUserMessage={(messageId, text) =>
            handleEditMessage({ messageId, text })
          }
          onRegenerate={(messageId) => handleRegenerate({ messageId })}
          onStop={stop}
          onSubmit={handleSubmit}
        />
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
