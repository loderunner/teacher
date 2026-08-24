'use client';

import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, type UIMessage } from 'ai';
import { useLocale } from 'next-intl';
import { useEffect } from 'react';

import { type ChatMessageMetadata, isChatMessageMetadata } from './metadata';

import type { PromptInputMessage } from '@/lib/components/ai-elements/prompt-input';
import { parseLocale } from '@/lib/i18n/locale';

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
  });

  const streaming = status === 'streaming' || status === 'submitted';

  useEffect(() => {
    return () => {
      void stop();
    };
  }, [stop]);

  const handleSubmit = ({ text, body }: HandleSubmitParams) => {
    void sendMessage({ text }, { body: { locale, ...body } });
  };

  const handleRegenerate = ({
    messageId,
    body,
  }: HandleRegenerateParams = {}) => {
    void regenerate({ messageId, body: { locale, ...body } });
  };

  const handleEditMessage = ({
    messageId,
    text,
    body,
  }: HandleEditMessageParams) => {
    void sendMessage({ text, messageId }, { body: { locale, ...body } });
  };

  const triggerResponse = (body?: Record<string, unknown>) => {
    void sendMessage(undefined, { body: { locale, ...body } });
  };

  const retry = (body?: Record<string, unknown>) => {
    const target = selectRetryTarget(messages);
    if (target.kind === 'regenerate') {
      handleRegenerate({ messageId: target.messageId, body });
      return;
    }
    triggerResponse(body);
  };

  return {
    messages,
    setMessages,
    sendMessage,
    status,
    stop,
    streaming,
    error,
    handleSubmit,
    handleRegenerate,
    handleEditMessage,
    triggerResponse,
    retry,
  };
}

/** What a retry after a failed turn should re-drive. */
export type RetryTarget =
  /** Re-run an assistant turn that failed part-way through streaming. */
  | { kind: 'regenerate'; messageId: string }
  /** Re-send the trailing user message (or the bare start signal) as a delta. */
  | { kind: 'resend' };

/**
 * Decides what a retry should re-drive, based on the last message the SDK
 * holds. A failed send leaves the optimistic user message in place; a failure
 * part-way through a stream leaves a partial assistant message after it.
 *
 * Re-sending a user message is safe whether or not it reached the database:
 * the chat routes truncate from its id and upsert it.
 *
 * @param messages - Current SDK message list.
 * @returns The turn to re-drive.
 *
 * @example
 * selectRetryTarget([userMessage]); // { kind: 'resend' }
 * selectRetryTarget([userMessage, partialAssistant]); // { kind: 'regenerate', messageId: … }
 */
export function selectRetryTarget(messages: UIMessage[]): RetryTarget {
  const last = messages.at(-1);
  if (last !== undefined && last.role === 'assistant') {
    return { kind: 'regenerate', messageId: last.id };
  }
  return { kind: 'resend' };
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
