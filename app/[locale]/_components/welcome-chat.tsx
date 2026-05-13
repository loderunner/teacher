'use client';

import { useChat } from '@ai-sdk/react';
import { CompassIcon } from '@phosphor-icons/react';
import {
  type ChatStatus,
  type DeepPartial,
  DefaultChatTransport,
  type InferUITools,
  type ToolUIPart,
  type UIDataTypes,
  type UIMessage,
  isReasoningUIPart,
} from 'ai';
import { useLocale, useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';

import { createJourneyAction } from './create-journey';
import { SyllabusDraftPanel } from './syllabus-draft-panel';

import { CodeBlock } from '@/components/ai-elements/code-block';
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
import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
} from '@/components/ai-elements/tool';
import { StylePicker } from '@/components/style-picker';
import { parseLocale } from '@/i18n/locale';
import { useRouter } from '@/i18n/navigation';
import type { Style } from '@/lib/server/styles/get';
import type { Syllabus } from '@/lib/server/syllabus/schema';
import { type updateSyllabusDraft } from '@/lib/syllabus-chat/tool';
import { cn } from '@/lib/tailwind';

type SyllabusChatTools = InferUITools<{
  updateSyllabusDraft: typeof updateSyllabusDraft;
}>;

type SyllabusChatUIMessage = UIMessage<unknown, UIDataTypes, SyllabusChatTools>;

type SyllabusDraftToolPart = ToolUIPart<SyllabusChatTools>;

function isSyllabusDraftToolPart(
  part: SyllabusChatUIMessage['parts'][number],
): part is SyllabusDraftToolPart {
  return part.type === 'tool-updateSyllabusDraft';
}

type Props = {
  presets: Style[];
};

type ProcessingIndicator = 'loading' | 'thinking' | 'tool-call';

function deriveProcessingIndicator(
  status: ChatStatus,
  messages: SyllabusChatUIMessage[],
): ProcessingIndicator | null {
  if (status === 'submitted') {
    return 'loading';
  }
  if (status !== 'streaming') {
    return null;
  }

  const lastMsg = messages[messages.length - 1];
  if (lastMsg.role !== 'assistant' || lastMsg.parts.length === 0) {
    return 'loading';
  }

  const lastPart = lastMsg.parts[lastMsg.parts.length - 1];
  if (lastPart.type === 'reasoning') {
    return 'thinking';
  }
  if (
    isSyllabusDraftToolPart(lastPart) &&
    lastPart.state !== 'output-available'
  ) {
    return 'tool-call';
  }
  return null;
}

/**
 * Walks assistant tool parts once (newest first) and returns the latest
 * complete syllabus for persistence and the latest display value for the panel.
 *
 * @param messages Chat messages from `useChat`.
 * @returns Latest complete `draft` for journey creation and latest `partialDraft`
 *   for the live panel (includes streaming tool input).
 */
function deriveDrafts(messages: SyllabusChatUIMessage[]) {
  let draft: Syllabus | null = null;
  let partialDraft: DeepPartial<Syllabus> | null = null;
  let partialResolved = false;

  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role !== 'assistant') {
      continue;
    }
    const { parts } = msg;
    for (let j = parts.length - 1; j >= 0; j--) {
      const part = parts[j];
      if (!isSyllabusDraftToolPart(part)) {
        continue;
      }

      if (!partialResolved) {
        if (
          part.state === 'output-available' ||
          part.state === 'input-available'
        ) {
          partialDraft = part.input.draft;
          partialResolved = true;
        } else if (part.state === 'input-streaming') {
          partialDraft = part.input?.draft ?? null;
          partialResolved = true;
        }
      }

      if (
        draft === null &&
        (part.state === 'output-available' || part.state === 'input-available')
      ) {
        draft = part.input.draft;
      }

      if (partialResolved && draft !== null) {
        return { draft, partialDraft };
      }
    }
  }

  return { draft, partialDraft };
}

export function WelcomeChat({ presets }: Props) {
  const t = useTranslations('Welcome');
  const locale = parseLocale(useLocale());
  const router = useRouter();

  const [styleId, setStyleId] = useState(presets[0]?.id ?? 'teacher');
  const [pending, startTransition] = useTransition();

  const { messages, sendMessage, status } = useChat<SyllabusChatUIMessage>({
    transport: new DefaultChatTransport({ api: '/api/syllabus/chat' }),
  });

  const streaming = status === 'streaming' || status === 'submitted';

  const indicatorLabels: Record<ProcessingIndicator, string | undefined> = {
    loading: undefined,
    thinking: t('thinkingIndicator'),
    'tool-call': t('toolCallIndicator'),
  };

  const indicator = deriveProcessingIndicator(status, messages);

  const { draft, partialDraft } = deriveDrafts(messages);

  const started = messages.length > 0;

  const startable =
    draft !== null && draft.chapters.length > 0 && styleId.length > 0;

  const getThinkingMessage = (isStreaming: boolean, duration?: number) => {
    if (isStreaming || duration === 0) {
      return t('thinkingInProgress');
    }
    if (duration === undefined) {
      return t('thoughtForFewSeconds');
    }
    return t('thoughtForSeconds', { seconds: duration });
  };

  const lastMessage = messages[messages.length - 1];
  const messageItems = messages.map((msg) => {
    const parts = msg.parts.map((part, i) => {
      if (isReasoningUIPart(part)) {
        const partStreaming = streaming && msg === lastMessage;
        return (
          <Reasoning key={i} isStreaming={partStreaming}>
            <ReasoningTrigger getThinkingMessage={getThinkingMessage} />
            <ReasoningContent>{part.text}</ReasoningContent>
          </Reasoning>
        );
      }
      if (isSyllabusDraftToolPart(part)) {
        const completed = part.state === 'output-available';
        const toolOutput = completed ? (
          <CodeBlock
            code={JSON.stringify(part.output, null, 2)}
            language="json"
          />
        ) : null;
        return (
          <Tool key={i} defaultOpen={completed}>
            <ToolHeader state={part.state} type={part.type} />
            <ToolContent>
              {part.state !== 'input-streaming' && (
                <ToolInput input={part.input} />
              )}
              {completed && (
                <ToolOutput errorText={part.errorText} output={toolOutput} />
              )}
            </ToolContent>
          </Tool>
        );
      }
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
    void sendMessage({ text }, { body: { styleId, locale } });
  };

  const handleStartJourney = () => {
    if (!startable) {
      return;
    }
    const syllabus = draft;
    startTransition(async () => {
      const result = await createJourneyAction({
        messages,
        syllabus,
        styleId,
      });
      router.push(result.path);
    });
  };

  return (
    <div className="flex flex-1 gap-6 overflow-hidden p-6">
      {/* Left: chat */}
      <section className="flex flex-1 flex-col overflow-hidden">
        <div
          className={cn(
            'mx-auto flex w-full max-w-3xl flex-1 flex-col',
            started ? 'gap-4 overflow-hidden' : 'pt-[12vh]',
          )}
        >
          <div
            className={cn(
              'overflow-hidden transition-all duration-500',
              started
                ? 'max-h-0 -translate-y-2 opacity-0'
                : 'max-h-[500px] translate-y-0 opacity-100',
            )}
          >
            <div className="mb-10 flex flex-col items-center gap-4 text-center">
              <CompassIcon className="size-16" weight="bold" />
              <h1 className="font-heading text-7xl font-black tracking-tight">
                {t('title')}
              </h1>
              <p className="text-muted-foreground text-xl">{t('tagline')}</p>
            </div>
          </div>

          {started && (
            <Conversation className="animate-in fade-in slide-in-from-bottom-4 flex-1 duration-500">
              <ConversationContent>
                {messageItems}
                {indicator !== null && (
                  <MessageIndicator
                    key="processing-indicator"
                    label={indicatorLabels[indicator]}
                    type={indicator}
                  />
                )}
              </ConversationContent>
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

          {!started && (
            <div className="mt-3">
              <StylePicker
                presets={presets}
                value={styleId}
                onChange={setStyleId}
              />
            </div>
          )}
        </div>
      </section>

      {/* Right: syllabus draft + controls */}
      {started && (
        <aside className="animate-in fade-in slide-in-from-right-8 flex w-80 flex-col gap-4 overflow-hidden duration-500 xl:w-96 2xl:w-md">
          <SyllabusDraftPanel draft={partialDraft} />
          <StylePicker
            presets={presets}
            value={styleId}
            onChange={setStyleId}
          />
          <div>
            {!startable && (
              <p className="text-muted-foreground mb-2 text-xs">
                {t('startJourneyDisabledHint')}
              </p>
            )}
            <button
              className="border-foreground bg-foreground text-background w-full rounded border px-4 py-2 text-sm font-medium transition-opacity disabled:opacity-40"
              disabled={!startable || pending}
              type="button"
              onClick={handleStartJourney}
            >
              {t('startJourney')}
            </button>
          </div>
        </aside>
      )}
    </div>
  );
}
