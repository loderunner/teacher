import 'client-only';

import {
  ArrowCounterClockwiseIcon,
  CheckIcon,
  CopyIcon,
  PencilSimpleIcon,
  XIcon,
} from '@phosphor-icons/react';
import {
  type ChatStatus,
  type DynamicToolUIPart,
  type UIMessage,
  isReasoningUIPart,
  isTextUIPart,
} from 'ai';
import { useTranslations } from 'next-intl';
import {
  type ComponentType,
  type ReactNode,
  createContext,
  useContext,
  useState,
} from 'react';

import { isChatMessageMetadata } from './metadata';

import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from '@/components/ai-elements/conversation';
import {
  Message,
  MessageAction,
  MessageActions,
  MessageBranch,
  MessageBranchContent,
  MessageBranchNext,
  MessageBranchPage,
  MessageBranchPrevious,
  MessageBranchSelector,
  MessageContent,
  MessageEvent,
  MessageIndicator,
  MessageResponse,
  MessageToolbar,
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

// Internal context holding the current tool part being rendered by JourneyChatView.
const ToolPartContext = createContext<unknown>(null);

function assertPartContext<T>(value: unknown): asserts value is T {
  if (value === null || value === undefined) {
    throw new Error(
      'useToolPartContext must be called inside a JourneyChatView tool component',
    );
  }
}

/**
 * Returns the part currently being rendered by JourneyChatView.
 * Must be called inside a component registered in the `tools` prop.
 *
 * @template T The expected part type, defaults to {@link DynamicToolUIPart}.
 *
 * @example
 * function MyToolCard() {
 *   const part = useToolPartContext<DynamicToolUIPart>();
 *   return <div>{part.toolCallId}</div>;
 * }
 */
export function useToolPartContext<T extends object = DynamicToolUIPart>(): T {
  const value = useContext(ToolPartContext);
  assertPartContext<T>(value);
  return value;
}

/**
 * Props for the {@link JourneyChatView} chat presentation component.
 */
export type JourneyChatViewProps = {
  /** Messages to display in the conversation. */
  messages: UIMessage[];
  /** Current chat streaming status. */
  status: ChatStatus;
  /** Placeholder text for the prompt input (ignored when {@link readOnly} is true). */
  placeholder: string;
  /**
   * When true, omits the prompt and hides edit/regenerate affordances — use for
   * static transcript pages.
   */
  readOnly?: boolean;
  /**
   * Called when the user submits a message (not invoked when {@link readOnly}).
   * Optional when `readOnly` is true.
   */
  onSubmit?: (message: PromptInputMessage) => void;
  /** Called when the user clicks the stop button during streaming. */
  onStop?: () => void;
  /** Called when the user requests regeneration of an assistant message. */
  onRegenerate?: (messageId: string) => void;
  /** Called when the user edits and resubmits a user message. */
  onEditUserMessage?: (messageId: string, text: string) => void;
  /**
   * Registry mapping tool part types to display components.
   * Each component reads its part data via {@link useToolPartContext}.
   */
  tools?: Record<string, ComponentType>;
};

// Maps assistant message IDs to their previous text versions (before each regeneration).
type PrevVersionsMap = Record<string, string[]>;

/** Props for the inline user message editor. */
type UserMessageEditorProps = {
  /** Current edit text value. */
  text: string;
  /** Accessible label for the save button. */
  saveLabel: string;
  /** Accessible label for the cancel button. */
  cancelLabel: string;
  /** Called when the text value changes. */
  onChange: (value: string) => void;
  /** Called when the user submits the edit. */
  onSave: () => void;
  /** Called when the user cancels the edit. */
  onCancel: () => void;
};

const UserMessageEditor = ({
  text,
  saveLabel,
  cancelLabel,
  onChange,
  onSave,
  onCancel,
}: UserMessageEditorProps) => (
  <div className="flex w-full flex-col items-end gap-2">
    <textarea
      autoFocus
      className="bg-secondary text-foreground field-sizing-content min-h-12 w-full rounded-lg px-4 py-3 text-sm outline-none"
      value={text}
      onChange={(e) => onChange(e.currentTarget.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
          e.preventDefault();
          onSave();
        } else if (e.key === 'Escape') {
          onCancel();
        }
      }}
    />
    <div className="flex gap-1">
      <MessageAction
        label={cancelLabel}
        tooltip={cancelLabel}
        onClick={onCancel}
      >
        <XIcon size={14} />
      </MessageAction>
      <MessageAction label={saveLabel} tooltip={saveLabel} onClick={onSave}>
        <CheckIcon size={14} />
      </MessageAction>
    </div>
  </div>
);

/**
 * Chat view that handles text, reasoning, and step-start parts and dispatches
 * tool and data parts to feature-supplied display components via a registry.
 *
 * @example
 * // Without tools
 * <JourneyChatView
 *   messages={messages}
 *   status={status}
 *   placeholder="Ask anything…"
 *   onSubmit={handleSubmit}
 * />
 *
 * @example
 * // With a tool registry
 * <JourneyChatView ... tools={{ 'tool-myTool': MyToolDisplay }} />
 */
export function JourneyChatView({
  messages,
  status,
  placeholder,
  readOnly = false,
  onSubmit = () => {},
  onStop,
  onRegenerate,
  onEditUserMessage,
  tools,
}: JourneyChatViewProps) {
  const t = useTranslations('JourneyChat');
  const streaming = status === 'streaming' || status === 'submitted';

  // Previous text versions for each assistant message, saved before each regeneration.
  const [prevVersions, setPrevVersions] = useState<PrevVersionsMap>({});

  // Inline edit state — at most one message is being edited at a time.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');

  const handleRegenerate = (msgId: string, currentText: string) => {
    setPrevVersions((prev) => ({
      ...prev,
      [msgId]: [...(prev[msgId] ?? []), currentText],
    }));
    onRegenerate?.(msgId);
  };

  const handleStartEdit = (msgId: string, text: string) => {
    setEditingId(msgId);
    setEditText(text);
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditText('');
  };

  const handleSaveEdit = (msgId: string) => {
    const trimmed = editText.trim();
    if (trimmed !== '') {
      onEditUserMessage?.(msgId, trimmed);
    }
    setEditingId(null);
    setEditText('');
  };

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

  const messageItems = messages.map((msg) => {
    const isLast = msg === lastMessage;
    const isActivelyStreaming = streaming && isLast;

    if (msg.role === 'user') {
      const text = msg.parts
        .filter(isTextUIPart)
        .map((p) => p.text)
        .join('\n');

      const { metadata } = msg;

      if (isChatMessageMetadata(metadata)) {
        if (metadata.hidden === true) {
          return null;
        }

        if (metadata.action !== undefined) {
          return <MessageEvent key={msg.id}>{text}</MessageEvent>;
        }
      }

      const editing = editingId === msg.id;

      return (
        <Message key={msg.id} from="user">
          {editing ? (
            <UserMessageEditor
              cancelLabel={t('cancelEdit')}
              saveLabel={t('saveEdit')}
              text={editText}
              onCancel={handleCancelEdit}
              onChange={setEditText}
              onSave={() => handleSaveEdit(msg.id)}
            />
          ) : (
            <>
              <MessageContent>{text}</MessageContent>
              {onEditUserMessage !== undefined && !streaming && !readOnly && (
                <MessageActions className="justify-end transition-opacity focus-within:opacity-100 sm:opacity-0 sm:group-hover:opacity-100">
                  <MessageAction
                    label={t('editMessage')}
                    tooltip={t('editMessage')}
                    onClick={() => handleStartEdit(msg.id, text)}
                  >
                    <PencilSimpleIcon size={14} />
                  </MessageAction>
                </MessageActions>
              )}
            </>
          )}
        </Message>
      );
    }

    // Assistant message — collect text for copy/branch tracking, then render parts.
    const msgText = msg.parts
      .filter(isTextUIPart)
      .map((p) => p.text)
      .join('\n\n');

    const prevMsgVersions = prevVersions[msg.id] ?? [];
    const versionCount = prevMsgVersions.length + 1;

    const parts = msg.parts.map((part, i) => {
      if (part.type === 'step-start') {
        return null;
      }
      if (isReasoningUIPart(part)) {
        return (
          <Reasoning
            key={i}
            defaultOpen={false}
            isStreaming={isActivelyStreaming}
          >
            <ReasoningTrigger getThinkingMessage={getThinkingMessage} />
            <ReasoningContent>{part.text}</ReasoningContent>
          </Reasoning>
        );
      }
      if (isTextUIPart(part)) {
        return (
          <MessageResponse key={i} isAnimating={isActivelyStreaming}>
            {part.text}
          </MessageResponse>
        );
      }
      const ToolComponent = tools?.[part.type];
      if (ToolComponent !== undefined) {
        return (
          <ToolPartContext.Provider key={i} value={part}>
            <ToolComponent />
          </ToolPartContext.Provider>
        );
      }
      return null;
    });

    return (
      <Message key={msg.id} from="assistant">
        {/*
         * key includes versionCount so MessageBranch remounts on each
         * regeneration, resetting the active branch to the latest version.
         */}
        <MessageBranch
          key={`${msg.id}-${versionCount}`}
          defaultBranch={versionCount - 1}
        >
          <MessageBranchContent>
            {prevMsgVersions.map((versionText, vi) => (
              <div key={String(vi)}>
                <MessageContent>
                  <MessageResponse>{versionText}</MessageResponse>
                </MessageContent>
              </div>
            ))}
            <div key="current">
              <MessageContent>{parts}</MessageContent>
            </div>
          </MessageBranchContent>
          {!isActivelyStreaming && (
            <MessageToolbar>
              {!readOnly && (
                <MessageBranchSelector>
                  <MessageBranchPrevious />
                  <MessageBranchPage />
                  <MessageBranchNext />
                </MessageBranchSelector>
              )}
              <MessageActions>
                {onRegenerate !== undefined && !readOnly && (
                  <MessageAction
                    label={t('regenerate')}
                    tooltip={t('regenerate')}
                    onClick={() => handleRegenerate(msg.id, msgText)}
                  >
                    <ArrowCounterClockwiseIcon size={14} />
                  </MessageAction>
                )}
                <MessageAction
                  label={t('copy')}
                  tooltip={t('copy')}
                  onClick={() => navigator.clipboard.writeText(msgText)}
                >
                  <CopyIcon size={14} />
                </MessageAction>
              </MessageActions>
            </MessageToolbar>
          )}
        </MessageBranch>
      </Message>
    );
  });

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-end gap-4 overflow-hidden px-1 pb-1">
      {messages.length > 0 && (
        <Conversation className="flex-1">
          <ConversationContent>{messageItems}</ConversationContent>
          <ConversationScrollButton />
        </Conversation>
      )}
      {showLoadingIndicator && !readOnly && <MessageIndicator type="loading" />}
      {!readOnly && (
        <PromptInput onSubmit={onSubmit}>
          <PromptInputTextarea disabled={streaming} placeholder={placeholder} />
          <PromptInputFooter>
            <div />
            <PromptInputSubmit status={status} onStop={onStop} />
          </PromptInputFooter>
        </PromptInput>
      )}
    </div>
  );
}
