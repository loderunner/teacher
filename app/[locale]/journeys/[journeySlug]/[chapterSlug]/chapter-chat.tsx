'use client';

import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { useLocale, useTranslations } from 'next-intl';

import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from '@/components/ai-elements/conversation';
import {
  Message,
  MessageContent,
  MessageResponse,
} from '@/components/ai-elements/message';
import {
  PromptInput,
  PromptInputFooter,
  type PromptInputMessage,
  PromptInputSubmit,
  PromptInputTextarea,
} from '@/components/ai-elements/prompt-input';
import { parseLocale } from '@/i18n/locale';
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
 */
export function ChapterChat({ journey, chapter }: Props) {
  const t = useTranslations('ChapterChat');
  const locale = parseLocale(useLocale());

  const { messages, sendMessage, status } = useChat({
    transport: new DefaultChatTransport({
      api: `/api/journeys/${journey.id}/chapters/${chapter.id}/chat`,
    }),
  });

  const streaming = status === 'streaming' || status === 'submitted';
  const lastMessage = messages[messages.length - 1];

  const messageItems = messages.map((msg) => {
    const parts = msg.parts.map((part, i) => {
      if (part.type !== 'text') {
        return null;
      }
      return (
        <MessageResponse key={i} isAnimating={streaming && msg === lastMessage}>
          {part.text}
        </MessageResponse>
      );
    });
    return (
      <Message key={msg.id} from={msg.role}>
        <MessageContent>{parts}</MessageContent>
      </Message>
    );
  });

  const handleSubmit = ({ text }: PromptInputMessage) => {
    if (text.trim() === '') {
      return;
    }
    void sendMessage({ text }, { body: { locale } });
  };

  return (
    <>
      {messages.length > 0 && (
        <Conversation className="flex-1">
          <ConversationContent>{messageItems}</ConversationContent>
          <ConversationScrollButton />
        </Conversation>
      )}
      <PromptInput onSubmit={handleSubmit}>
        <PromptInputTextarea
          disabled={streaming}
          placeholder={t('promptPlaceholder')}
        />
        <PromptInputFooter>
          <div />
          <PromptInputSubmit status={status} />
        </PromptInputFooter>
      </PromptInput>
    </>
  );
}
