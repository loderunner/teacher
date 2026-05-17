'use client';

import { ArrowRightIcon } from '@phosphor-icons/react';
import { type UIMessage } from 'ai';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';

import { activateJourneyAction } from '../new/activate-journey';
import { SyllabusDraftPanel } from '../new/syllabus-draft-panel';
import { SyllabusPartDelegate } from '../new/syllabus-part-delegate';

import { ChatPageShell } from '@/components/chat-page-shell';
import { StylePicker } from '@/components/style-picker';
import { useRouter } from '@/i18n/navigation';
import { JourneyChatView, useJourneyChat } from '@/lib/journey-chat';
import type { Journey } from '@/lib/server/journeys/get';
import type { Style } from '@/lib/server/styles/get';
import { deriveSyllabusDraftsFromMessages } from '@/lib/syllabus-chat';

type Props = {
  journey: Journey;
  initialMessages: UIMessage[];
  presets: Style[];
};

/**
 * Resumes syllabus drafting for an existing journey row loaded from the database.
 */
export function JourneySyllabusChat({
  journey,
  initialMessages,
  presets,
}: Props) {
  const t = useTranslations('Welcome');
  const router = useRouter();
  const journeyId = journey.id;
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
  } = useJourneyChat<UIMessage>({
    api: '/api/syllabus/chat',
    initialMessages,
  });

  const { draft, partialDraft } = deriveSyllabusDraftsFromMessages(messages);

  const started = messages.length > 0;
  const startable =
    draft !== null && draft.chapters.length > 0 && styleId.length > 0;

  const syllabusBody = { journeyId, styleId };

  const handleStartJourney = () => {
    if (!startable) {
      return;
    }
    const syllabus = draft;
    startTransition(async () => {
      const result = await activateJourneyAction({
        journeyId,
        messages,
        syllabus,
        styleId,
      });
      router.push(result.path);
    });
  };

  return (
    <ChatPageShell>
      <ChatPageShell.Content>
        <JourneyChatView
          MessagePartDelegate={SyllabusPartDelegate}
          messages={messages}
          placeholder={t('promptPlaceholder')}
          status={status}
          onEditUserMessage={(messageId, text) =>
            handleEditMessage({ messageId, text, body: syllabusBody })
          }
          onRegenerate={(messageId) =>
            handleRegenerate({ messageId, body: syllabusBody })
          }
          onStop={stop}
          onSubmit={(msg) => void handleSubmit({ ...msg, body: syllabusBody })}
        />
        {startable && (
          <div className="mx-auto flex w-full max-w-3xl justify-end px-1 pb-1">
            <button
              className="border-foreground bg-foreground text-background flex w-full items-center justify-center gap-2 rounded border px-4 py-2 text-sm font-medium transition-opacity disabled:opacity-40 md:w-auto md:justify-start"
              disabled={pending || streaming}
              type="button"
              onClick={handleStartJourney}
            >
              <ArrowRightIcon size={15} weight="bold" />
              {t('startJourney')}
            </button>
          </div>
        )}
      </ChatPageShell.Content>

      {started && (
        <ChatPageShell.Sidebar>
          <SyllabusDraftPanel draft={partialDraft} />
          <StylePicker
            presets={presets}
            value={styleId}
            onChange={setStyleId}
          />
        </ChatPageShell.Sidebar>
      )}
    </ChatPageShell>
  );
}
