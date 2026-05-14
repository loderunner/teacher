'use client';

import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, type UIMessage } from 'ai';
import { useLocale } from 'next-intl';
import { useCallback } from 'react';

import type { PromptInputMessage } from '@/components/ai-elements/prompt-input';
import { parseLocale } from '@/i18n/locale';

/** Parameters for {@link useJourneyChat}. */
export type UseJourneyChatParams = {
  /** The API route to send chat messages to. */
  api: string;
};

/** Message submission payload, optionally augmented with per-submit body fields. */
export type HandleSubmitParams = PromptInputMessage & {
  /** Extra fields merged into the request body alongside `locale`. */
  body?: Record<string, unknown>;
};

/**
 * Generic chat hook that wraps `useChat` with locale injection and a
 * per-message `body` argument so callers can forward feature-specific
 * fields (e.g. `styleId`) without recreating the hook or fighting stale
 * closures.
 *
 * @param params - API route configuration.
 * @returns Messages, status, streaming flag, a submit handler, and a trigger function.
 *
 * @example
 * const { messages, status, streaming, handleSubmit, triggerResponse } = useJourneyChat({
 *   api: '/api/journeys/123/chapters/456/chat',
 * });
 */
export function useJourneyChat<TMessage extends UIMessage = UIMessage>({
  api,
}: UseJourneyChatParams) {
  const locale = parseLocale(useLocale());
  const { messages, sendMessage, status } = useChat<TMessage>({
    transport: new DefaultChatTransport({ api }),
  });

  const streaming = status === 'streaming' || status === 'submitted';

  const handleSubmit = ({ text, body }: HandleSubmitParams) => {
    void sendMessage({ text }, { body: { locale, ...body } });
  };

  const triggerResponse = useCallback(
    (body?: Record<string, unknown>) => {
      void sendMessage(undefined, { body: { locale, ...body } });
    },
    [sendMessage, locale],
  );

  return {
    messages,
    sendMessage,
    status,
    streaming,
    handleSubmit,
    triggerResponse,
  };
}
