'use client';

import type { UIMessage } from 'ai';

import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from '@/components/ai-elements/conversation';
import { Message, MessageContent } from '@/components/ai-elements/message';
import {
  PromptInput,
  PromptInputFooter,
  type PromptInputMessage,
  PromptInputSubmit,
  PromptInputTextarea,
} from '@/components/ai-elements/prompt-input';

/** Props for {@link ChatScaffold}. */
export type ChatScaffoldProps<TMessage extends UIMessage = UIMessage> = {
  /** Chat messages from `useChat`. */
  messages: TMessage[];
  /** `useChat` status — used to derive streaming state and disable input. */
  status: 'streaming' | 'submitted' | 'ready' | 'error';
  /** Placeholder string for the prompt textarea (localised by the caller). */
  placeholder: string;
  /** Called when the user submits a non-empty message. */
  onSubmit: (text: string) => void;
  /**
   * Per-part renderer. Receives the part, its parent message, and streaming
   * context. Return `null` to hide a part.
   */
  renderPart: (
    part: TMessage['parts'][number],
    ctx: { message: TMessage; streaming: boolean; index: number },
  ) => React.ReactNode;
  /**
   * Optional extra content rendered inside `ConversationContent` after all
   * message items — useful for processing indicators.
   */
  indicatorContent?: React.ReactNode;
};

/**
 * Shared Conversation + Message-mapping + PromptInput stack used by both the
 * welcome page and every chapter page.
 *
 * The `renderPart` callback is the only per-page customisation point in Story 2.
 * Place this inside `ChatPageShell.Content` — no outer wrapper needed.
 *
 * @example
 * <ChatScaffold
 *   messages={messages}
 *   status={status}
 *   placeholder="Ask anything…"
 *   onSubmit={(text) => sendMessage({ text })}
 *   renderPart={(part, { streaming, index }) =>
 *     part.type === 'text' ? (
 *       <MessageResponse key={index} isAnimating={streaming}>
 *         {part.text}
 *       </MessageResponse>
 *     ) : null
 *   }
 * />
 */
export function ChatScaffold<TMessage extends UIMessage = UIMessage>({
  messages,
  status,
  placeholder,
  onSubmit,
  renderPart,
  indicatorContent,
}: ChatScaffoldProps<TMessage>) {
  const streaming = status === 'streaming' || status === 'submitted';
  const lastMessage = messages[messages.length - 1];

  const messageItems = messages.map((msg) => {
    const parts = msg.parts.map((part, i) =>
      renderPart(part, {
        message: msg,
        streaming: streaming && msg === lastMessage,
        index: i,
      }),
    );
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
    onSubmit(text);
  };

  return (
    <>
      {messages.length > 0 && (
        <Conversation className="flex-1">
          <ConversationContent>
            {messageItems}
            {indicatorContent}
          </ConversationContent>
          <ConversationScrollButton />
        </Conversation>
      )}

      <PromptInput onSubmit={handleSubmit}>
        <PromptInputTextarea disabled={streaming} placeholder={placeholder} />
        <PromptInputFooter>
          <div />
          <PromptInputSubmit status={status} />
        </PromptInputFooter>
      </PromptInput>
    </>
  );
}
