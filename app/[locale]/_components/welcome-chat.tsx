'use client';

import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, type UIMessage } from 'ai';
import { useLocale, useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';

import { createJourneyAction } from './create-journey';
import { SyllabusDraftPanel } from './syllabus-draft-panel';

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
  PromptInputSubmit,
  PromptInputTextarea,
} from '@/components/ai-elements/prompt-input';
import { StylePicker } from '@/components/style-picker';
import { parseLocale } from '@/i18n/locale';
import { useRouter } from '@/i18n/navigation';
import type { Style } from '@/lib/server/styles/get';
import type { Syllabus } from '@/lib/server/syllabus/schema';

type Props = {
  presets: Style[];
};

/**
 * Returns the latest syllabus draft from assistant tool parts, if any.
 *
 * @param messages Chat messages from `useChat`.
 * @returns The most recent `fullDraft` from `tool-updateSyllabusDraft`, or null.
 */
function deriveLatestSyllabusDraft(messages: UIMessage[]): Syllabus | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role !== 'assistant') {
      continue;
    }
    const { parts } = msg;
    for (let j = parts.length - 1; j >= 0; j--) {
      const part = parts[j];
      if (
        part.type === 'tool-updateSyllabusDraft' &&
        (part.state === 'output-available' || part.state === 'input-available')
      ) {
        const input = (part as { input?: { fullDraft?: Syllabus } }).input;
        if (input !== undefined && input.fullDraft !== undefined) {
          return input.fullDraft;
        }
      }
    }
  }
  return null;
}

export function WelcomeChat({ presets }: Props) {
  const t = useTranslations('Welcome');
  const locale = parseLocale(useLocale());
  const router = useRouter();

  const [styleId, setStyleId] = useState(presets[0]?.id ?? 'teacher');
  const [pending, startTransition] = useTransition();

  const { messages, sendMessage, status } = useChat({
    transport: new DefaultChatTransport({ api: '/api/syllabus/chat' }),
  });

  const streaming = status === 'streaming' || status === 'submitted';

  const draft = deriveLatestSyllabusDraft(messages);

  const startable =
    draft !== null && draft.chapters.length > 0 && styleId.length > 0;

  const handleSubmit = ({ text }: { text: string; files: unknown[] }) => {
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
      <div className="flex flex-1 flex-col gap-4 overflow-hidden">
        <Conversation className="flex-1">
          <ConversationContent>
            {messages.map((msg) => (
              <Message key={msg.id} from={msg.role}>
                <MessageContent>
                  {msg.parts.map((part, i) => {
                    if (part.type !== 'text') {
                      return null;
                    }
                    return (
                      <MessageResponse
                        key={i}
                        isAnimating={
                          streaming && msg === messages[messages.length - 1]
                        }
                      >
                        {part.text}
                      </MessageResponse>
                    );
                  })}
                </MessageContent>
              </Message>
            ))}
          </ConversationContent>
          <ConversationScrollButton />
        </Conversation>

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
      </div>

      {/* Right: syllabus draft + controls */}
      <div className="flex w-80 flex-col gap-4 overflow-y-auto">
        <SyllabusDraftPanel draft={draft} />
        <StylePicker presets={presets} value={styleId} onChange={setStyleId} />
        <div>
          {!startable && (
            <p className="mb-2 text-xs text-muted-foreground">
              {t('startJourneyDisabledHint')}
            </p>
          )}
          <button
            className="w-full rounded border border-foreground bg-foreground px-4 py-2 text-sm font-medium text-background transition-opacity disabled:opacity-40"
            disabled={!startable || pending}
            type="button"
            onClick={handleStartJourney}
          >
            {t('startJourney')}
          </button>
        </div>
      </div>
    </div>
  );
}
