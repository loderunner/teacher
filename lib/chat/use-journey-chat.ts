'use client';

import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, type UIMessage } from 'ai';
import { useLocale } from 'next-intl';
import { useEffect, useRef, useState } from 'react';

import type { PromptInputMessage } from '@/lib/components/ai-elements/prompt-input';
import { parseLocale } from '@/lib/i18n/locale';

import { type ChatMessageMetadata, isChatMessageMetadata } from './metadata';

type JourneyChatMessage = UIMessage<ChatMessageMetadata>;

/** Parameters for {@link useJourneyChat}. */
export type UseJourneyChatParams = {
  /** The API route to send chat messages to. */
  api: string;
  /** Pre-populated messages for resumed sessions. */
  initialMessages?: UIMessage[];
};

/** Message submission payload, optionally augmented with per-submit body fields. */
export type HandleSubmitParams = PromptInputMessage & {
  /** Extra fields merged into the request body alongside `locale`. */
  body?: Record<string, unknown>;
};

/** Parameters for {@link UseJourneyChatReturn.handleRegenerate}. */
export type HandleRegenerateParams = {
  /** ID of the assistant message to regenerate. Defaults to the last assistant message. */
  messageId?: string;
  /** Extra fields merged into the request body alongside `locale`. */
  body?: Record<string, unknown>;
};

/** Parameters for {@link UseJourneyChatReturn.handleEditMessage}. */
export type HandleEditMessageParams = {
  /** ID of the user message to replace. */
  messageId: string;
  /** New message text. */
  text: string;
  /** Extra fields merged into the request body alongside `locale`. */
  body?: Record<string, unknown>;
};

/**
 * Chat hook that wraps `useChat` with locale injection and a per-message
 * `body` argument so callers can forward feature-specific fields (e.g.
 * `styleId`) without recreating the hook or fighting stale closures.
 *
 * @param params - API route configuration.
 * @returns Messages, status, streaming flag, a submit handler, and a trigger function.
 *
 * @example
 * const { messages, status, streaming, handleSubmit, triggerResponse } = useJourneyChat({
 *   api: '/api/journeys/123/chapters/456/chat',
 * });
 */
export function useJourneyChat({ api, initialMessages }: UseJourneyChatParams) {
  const locale = parseLocale(useLocale());
  const typedInitialMessages = initialMessages?.map(
    (m): JourneyChatMessage => ({
      ...m,
      metadata: isChatMessageMetadata(m.metadata) ? m.metadata : undefined,
    }),
  );
  /** Text handed back to the prompt after a send that never reached the server. */
  const [draft, setDraft] = useState<string | null>(null);
  // Text of the message currently in flight from handleSubmit, if any.
  const pendingTextRef = useRef<string | null>(null);
  const {
    messages,
    setMessages,
    sendMessage,
    status,
    stop,
    regenerate,
    error,
  } = useChat<JourneyChatMessage>({
    transport: new DefaultChatTransport({
      api,
      prepareSendMessagesRequest: prepareChatRequest,
    }),
    ...(typedInitialMessages !== undefined
      ? { messages: typedInitialMessages }
      : {}),
    onFinish: ({ messages: after, isError }) => {
      const text = pendingTextRef.current;
      pendingTextRef.current = null;
      if (!isError || text === null || after.at(-1)?.role === 'assistant') {
        return;
      }
      // No `start` chunk, so the route never got as far as persisting the message.
      setMessages((prev) => prev.slice(0, -1));
      setDraft(text);
    },
  });

  const streaming = status === 'streaming' || status === 'submitted';

  useEffect(() => {
    return () => {
      void stop();
    };
  }, [stop]);

  const handleSubmit = ({ text, body }: HandleSubmitParams) => {
    pendingTextRef.current = text;
    setDraft(null);
    void sendMessage({ text }, { body: { locale, ...body } });
  };

  const handleRegenerate = ({
    messageId,
    body,
  }: HandleRegenerateParams = {}) => {
    setDraft(null);
    void regenerate({ messageId, body: { locale, ...body } });
  };

  const handleEditMessage = ({
    messageId,
    text,
    body,
  }: HandleEditMessageParams) => {
    setDraft(null);
    void sendMessage({ text, messageId }, { body: { locale, ...body } });
  };

  const triggerResponse = (body?: Record<string, unknown>) => {
    setDraft(null);
    void sendMessage(undefined, { body: { locale, ...body } });
  };

  return {
    messages,
    setMessages,
    sendMessage,
    status,
    stop,
    streaming,
    error,
    draft,
    handleSubmit,
    handleRegenerate,
    handleEditMessage,
    triggerResponse,
  };
}

/** Options passed by the AI SDK to {@link prepareChatRequest}. */
type PrepareChatRequestOptions = {
  messages: UIMessage[];
  trigger: 'submit-message' | 'regenerate-message';
  messageId?: string;
  body?: Readonly<Record<string, unknown>>;
};

/**
 * Transforms the full SDK message list into a delta request body. Called by
 * `DefaultChatTransport` before each send.
 *
 * - `regenerate-message` → `{ regenerateFromMessageId }` (no message payload).
 * - `submit-message` with messages → `{ message: last }` (single delta).
 * - `submit-message` with empty messages → no `message` (start signal for
 *   assistant-first chapters).
 *
 * @example
 * new DefaultChatTransport({ api, prepareSendMessagesRequest: prepareChatRequest })
 */
export function prepareChatRequest({
  messages,
  trigger,
  messageId,
  body,
}: PrepareChatRequestOptions): { body: Record<string, unknown> } {
  if (trigger === 'regenerate-message') {
    return { body: { ...body, regenerateFromMessageId: messageId } };
  }

  const requestBody: Record<string, unknown> = { ...body };

  const last = messages.at(-1);
  if (last !== undefined) {
    requestBody.message = last;
  }

  return { body: requestBody };
}
