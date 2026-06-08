'use client';

import type { UIMessage } from 'ai';
import { useTranslations } from 'next-intl';
import { type ComponentType, useEffect, useRef, useState } from 'react';

import { SyllabusChangeCard } from './syllabus-change-card';
import { SyllabusChangeContext } from './syllabus-change-context';

import { ChatPageShell, Title } from '@/components/chat-page';
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
  initialMessages: UIMessage[];
};

type MarkChapterCompleteOutput = { nextChapterPath: string | null };

const isMarkChapterCompleteOutput = (
  v: unknown,
): v is MarkChapterCompleteOutput => {
  if (typeof v !== 'object' || v === null || !('nextChapterPath' in v)) {
    return false;
  }
  const record = v as Record<string, unknown>;
  return (
    record.nextChapterPath === null ||
    typeof record.nextChapterPath === 'string'
  );
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

  const navigatedRef = useRef(false);
  useEffect(() => {
    if (status !== 'ready' || navigatedRef.current) {
      return;
    }
    for (const m of messages) {
      if (m.role !== 'assistant') {
        continue;
      }
      for (const p of m.parts) {
        if (p.type !== 'tool-markChapterComplete') {
          continue;
        }
        if (p.state !== 'output-available') {
          continue;
        }
        if (!isMarkChapterCompleteOutput(p.output)) {
          continue;
        }
        navigatedRef.current = true;
        if (p.output.nextChapterPath !== null) {
          router.push(p.output.nextChapterPath);
        } else {
          router.refresh();
        }
        return;
      }
    }
  }, [status, messages, router]);

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
