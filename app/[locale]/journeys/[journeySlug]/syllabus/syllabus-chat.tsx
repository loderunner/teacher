'use client';

import { ArrowRightIcon } from '@phosphor-icons/react';
import { type UIMessage } from 'ai';
import { useTranslations } from 'next-intl';
import {
  type ComponentType,
  useEffect,
  useRef,
  useState,
  useTransition,
} from 'react';

import { activateJourneyAction } from './activate-journey';
import { deriveSyllabusDraftsFromMessages } from './derive-syllabus-draft';
import { SyllabusDraftDisplay } from './syllabus-draft-display';

import { Button, ChatPageShell } from '@/components/chat-page';
import { StylePicker, SyllabusPanel } from '@/components/journey';
import { useRouter } from '@/i18n/navigation';
import { JourneyChatView, useJourneyChat } from '@/lib/journey-chat';
import type { Journey } from '@/lib/server/journeys/get';
import type { Style } from '@/lib/server/styles/get';

const SYLLABUS_TOOLS: Record<string, ComponentType> = {
  'tool-updateSyllabusDraft': SyllabusDraftDisplay,
};

/** Props for {@link SyllabusChat}. */
type Props = {
  /** Draft journey row being edited. */
  journey: Journey;
  /** Messages already persisted for this draft (one user turn for brand-new drafts). */
  initialMessages: UIMessage[];
  /** Teaching style presets for the sidebar picker. */
  presets: Style[];
};

/**
 * Syllabus-building chat for a draft journey. Renders the persisted
 * transcript, streams new turns, and exposes "Start journey" once the model
 * has produced a complete syllabus.
 */
export function SyllabusChat({ journey, initialMessages, presets }: Props) {
  const t = useTranslations('Welcome');
  const router = useRouter();
  const [styleId, setStyleId] = useState(journey.styleId);
  const [pending, startTransition] = useTransition();

  const {
    messages,
    status,
    stop,
    streaming,
    handleSubmit,
    handleRegenerate,
    handleEditMessage,
    triggerResponse,
  } = useJourneyChat({
    api: `/api/journeys/${journey.id}/syllabus/chat`,
    initialMessages,
  });

  useEffect(
    () => () => {
      void stop();
    },
    [stop],
  );

  // When the draft was just created from the hero, the only persisted message
  // is the user's first prompt — kick off the assistant response on mount.
  const triggeredRef = useRef(false);
  useEffect(() => {
    if (triggeredRef.current) {
      return;
    }
    if (initialMessages.length === 0) {
      return;
    }
    const last = initialMessages[initialMessages.length - 1];
    if (last.role !== 'user') {
      return;
    }
    triggeredRef.current = true;
    triggerResponse();
    // Only the initial state matters; later changes are handled by submit/regenerate.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { draft, partialDraft } = deriveSyllabusDraftsFromMessages(messages);
  const started = messages.length > 0;
  const startable = draft !== null && draft.chapters.length > 0;

  const handleStartJourney = () => {
    if (!startable) {
      return;
    }
    const syllabus = draft;
    startTransition(async () => {
      const result = await activateJourneyAction({
        journeyId: journey.id,
        syllabus,
      });
      router.push(result.path);
    });
  };

  return (
    <ChatPageShell.Root>
      <ChatPageShell.Content>
        <JourneyChatView
          messages={messages}
          placeholder={t('promptPlaceholder')}
          status={status}
          tools={SYLLABUS_TOOLS}
          onEditUserMessage={(messageId, text) =>
            handleEditMessage({ messageId, text })
          }
          onRegenerate={(messageId) => handleRegenerate({ messageId })}
          onStop={stop}
          onSubmit={handleSubmit}
        />
        {startable && (
          <ChatPageShell.Footer>
            <Button
              disabled={pending || streaming}
              onClick={handleStartJourney}
            >
              <ArrowRightIcon size={15} weight="bold" />
              {t('startJourney')}
            </Button>
          </ChatPageShell.Footer>
        )}
      </ChatPageShell.Content>

      {started && (
        <ChatPageShell.Sidebar>
          <SyllabusPanel draft={partialDraft} mode="draft" />
          <StylePicker
            presets={presets}
            value={styleId}
            onChange={setStyleId}
          />
        </ChatPageShell.Sidebar>
      )}
    </ChatPageShell.Root>
  );
}
