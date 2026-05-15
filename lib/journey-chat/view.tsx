'use client';

import {
  type ChatStatus,
  type DataUIPart,
  type DynamicToolUIPart,
  type ToolUIPart,
  type UIDataTypes,
  type UIMessage,
  type UITools,
  isReasoningUIPart,
  isTextUIPart,
} from 'ai';
import { useTranslations } from 'next-intl';
import { type ComponentType, type ReactNode } from 'react';

import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from '@/components/ai-elements/conversation';
import {
  Message,
  MessageContent,
  MessageIndicator,
  MessageResponse,
} from '@/components/ai-elements/message';
import {
  PromptInput,
  PromptInputFooter,
  type PromptInputMessage,
  PromptInputSubmit,
  PromptInputTextarea,
} from '@/components/ai-elements/prompt-input';
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from '@/components/ai-elements/reasoning';
import { Shimmer } from '@/components/ai-elements/shimmer';

// Not exported from `ai` — defined locally from the same source types.
type InferUIMessageData<T extends UIMessage> =
  T extends UIMessage<unknown, infer DATA_TYPES, UITools>
    ? DATA_TYPES
    : UIDataTypes;

type InferUIMessageTools<T extends UIMessage> =
  T extends UIMessage<unknown, UIDataTypes, infer TOOLS> ? TOOLS : UITools;

/**
 * Props passed to a feature-supplied `MessagePartDelegate` component.
 *
 * @template TMessage The typed `UIMessage` variant for the current feature.
 */
export type MessagePartDelegateProps<TMessage extends UIMessage = UIMessage> = {
  /**
   * The message part to render. Will be a tool call, dynamic tool call,
   * or a data part — text and reasoning are handled by the view itself.
   */
  part:
    | ToolUIPart<InferUIMessageTools<TMessage>>
    | DynamicToolUIPart
    | DataUIPart<InferUIMessageData<TMessage>>;
};

/**
 * Props for the {@link JourneyChatView} generic chat presentation component.
 *
 * @template TMessage The typed `UIMessage` variant for the current feature.
 */
export type JourneyChatViewProps<TMessage extends UIMessage = UIMessage> = {
  /** Messages to display in the conversation. */
  messages: TMessage[];
  /** Current chat streaming status. */
  status: ChatStatus;
  /** Placeholder text for the prompt input. */
  placeholder: string;
  /** Called when the user submits a message. */
  onSubmit: (message: PromptInputMessage) => void;
  /** Called when the user clicks the stop button during streaming. */
  onStop?: () => void;
  /**
   * Optional component for rendering tool call and data parts.
   * Text and reasoning parts are always handled by the view itself.
   */
  MessagePartDelegate?: ComponentType<MessagePartDelegateProps<TMessage>>;
};

/**
 * Generic chat view that handles text, reasoning, and step-start parts
 * and delegates tool calls and data parts to a feature-supplied component.
 *
 * @template TMessage The typed `UIMessage` variant for the current feature.
 *
 * @example
 * // Without a delegate
 * <JourneyChatView
 *   messages={messages}
 *   status={status}
 *   placeholder="Ask anything…"
 *   onSubmit={handleSubmit}
 * />
 *
 * @example
 * // With a delegate
 * <JourneyChatView ... MessagePartDelegate={SyllabusPartDelegate} />
 */
export function JourneyChatView<TMessage extends UIMessage = UIMessage>({
  messages,
  status,
  placeholder,
  onSubmit,
  onStop,
  MessagePartDelegate,
}: JourneyChatViewProps<TMessage>) {
  const t = useTranslations('JourneyChat');
  const streaming = status === 'streaming' || status === 'submitted';

  const getThinkingMessage = (
    isStreaming: boolean,
    duration?: number,
  ): ReactNode => {
    if (isStreaming || duration === 0) {
      return <Shimmer duration={1}>{t('thinkingInProgress')}</Shimmer>;
    }
    if (duration === undefined) {
      return <p>{t('thoughtForFewSeconds')}</p>;
    }
    return <p>{t('thoughtForSeconds', { seconds: duration })}</p>;
  };

  const lastMessage = messages[messages.length - 1];

  const showLoadingIndicator =
    status === 'submitted' ||
    (status === 'streaming' &&
      messages.length > 0 &&
      messages[messages.length - 1].role === 'assistant' &&
      messages[messages.length - 1].parts.length === 0);

  // Capture before the map so the closure type is `ComponentType | undefined`
  // and TypeScript can narrow it correctly inside the callback.
  const Delegate = MessagePartDelegate;

  const messageItems = messages.map((msg) => {
    const isLast = msg === lastMessage;
    const parts = msg.parts.map((part, i) => {
      if (part.type === 'step-start') {
        return null;
      }
      if (isReasoningUIPart(part)) {
        return (
          <Reasoning
            key={i}
            defaultOpen={false}
            isStreaming={streaming && isLast}
          >
            <ReasoningTrigger getThinkingMessage={getThinkingMessage} />
            <ReasoningContent>{part.text}</ReasoningContent>
          </Reasoning>
        );
      }
      if (isTextUIPart(part)) {
        return (
          <MessageResponse key={i} isAnimating={streaming && isLast}>
            {part.text}
          </MessageResponse>
        );
      }
      if (Delegate !== undefined) {
        const delegatePart = part as
          | ToolUIPart<InferUIMessageTools<TMessage>>
          | DynamicToolUIPart
          | DataUIPart<InferUIMessageData<TMessage>>;
        return <Delegate key={i} part={delegatePart} />;
      }
      return null;
    });

    return (
      <Message key={msg.id} from={msg.role}>
        <MessageContent>{parts}</MessageContent>
      </Message>
    );
  });

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-end gap-4 overflow-hidden">
      {messages.length > 0 && (
        <Conversation className="flex-1">
          <ConversationContent>{messageItems}</ConversationContent>
          <ConversationScrollButton />
        </Conversation>
      )}
      {showLoadingIndicator && <MessageIndicator type="loading" />}
      <PromptInput onSubmit={onSubmit}>
        <PromptInputTextarea disabled={streaming} placeholder={placeholder} />
        <PromptInputFooter>
          <div />
          <PromptInputSubmit status={status} onStop={onStop} />
        </PromptInputFooter>
      </PromptInput>
    </div>
  );
}
