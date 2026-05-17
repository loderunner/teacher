'use client';

import { ArrowRightIcon } from '@phosphor-icons/react';
import { type UIMessage } from 'ai';
import { useTranslations } from 'next-intl';
import { useEffect, useState, useTransition } from 'react';

import { activateJourneyAction } from './activate-journey';
import {
  type CreateDraftJourneyResult,
  createDraftJourneyAction,
} from './create-draft-journey';
import { SyllabusDraftPanel } from './syllabus-draft-panel';
import { SyllabusPartDelegate } from './syllabus-part-delegate';

import { ChatPageShell } from '@/components/chat-page-shell';
import { StylePicker } from '@/components/style-picker';
import { useRouter } from '@/i18n/navigation';
import {
  JourneyChatView,
  clearInitialDraft,
  retrieveInitialDraft,
  useJourneyChat,
} from '@/lib/journey-chat';
import type { Style } from '@/lib/server/styles/get';
import { deriveSyllabusDraftsFromMessages } from '@/lib/syllabus-chat';

/** Dedupes draft creation when React Strict Mode runs effects twice. */
const draftBootstrapPromises = new Map<
  string,
  Promise<CreateDraftJourneyResult>
>();

/** Ensures the first assistant message is only sent once per new journey id. */
const initialSyllabusSubmitSent = new Set<string>();

/** Props for {@link SyllabusChat}. */
type Props = {
  /** Available teaching style presets. */
  presets: Style[];
};

/**
 * Syllabus-building chat that reads the hero payload from sessionStorage,
 * creates a draft journey, updates the URL bar without a navigation, then
 * streams from `/api/syllabus/chat` with persisted messages.
 */
export function SyllabusChat({ presets }: Props) {
  const t = useTranslations('Welcome');
  const router = useRouter();

  const defaultStyleId = presets.length > 0 ? presets[0].id : 'teacher';

  const [hasDraft] = useState(() => retrieveInitialDraft() !== null);
  const [styleId, setStyleId] = useState<string>(
    () => retrieveInitialDraft()?.styleId ?? defaultStyleId,
  );
  const [journeyId, setJourneyId] = useState<string | null>(null);
  const [creatingJourney, setCreatingJourney] = useState(hasDraft);
  const [pending, startTransition] = useTransition();

  const {
    messages,
    status,
    stop,
    streaming,
    handleSubmit,
    handleRegenerate,
    handleEditMessage,
  } = useJourneyChat<UIMessage>({ api: '/api/syllabus/chat' });

  useEffect(() => {
    const draft = retrieveInitialDraft();
    if (draft === null) {
      router.replace('/');
      return;
    }

    const draftKey = `${draft.styleId}\n${draft.text}`;
    let bootstrapPromise = draftBootstrapPromises.get(draftKey);
    if (bootstrapPromise === undefined) {
      bootstrapPromise = createDraftJourneyAction({
        text: draft.text,
        styleId: draft.styleId,
      });
      draftBootstrapPromises.set(draftKey, bootstrapPromise);
    }

    startTransition(() => {
      void bootstrapPromise
        .then((result) => {
          const pathname = window.location.pathname;
          const parts = pathname.split('/').filter((p) => p !== '');
          const j = parts.indexOf('journeys');
          const prefix = j > 0 ? `/${parts.slice(0, j).join('/')}` : '';
          window.history.replaceState(null, '', `${prefix}${result.path}`);
          clearInitialDraft();
          draftBootstrapPromises.delete(draftKey);
          setJourneyId(result.id);
          setCreatingJourney(false);
          if (initialSyllabusSubmitSent.has(result.id)) {
            return;
          }
          initialSyllabusSubmitSent.add(result.id);
          handleSubmit({
            text: draft.text,
            files: [],
            body: { journeyId: result.id, styleId: draft.styleId },
          });
        })
        .catch(() => {
          draftBootstrapPromises.delete(draftKey);
          router.replace('/');
        });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  if (!hasDraft) {
    return null;
  }

  const { draft, partialDraft } = deriveSyllabusDraftsFromMessages(messages);

  const started = messages.length > 0;
  const startable =
    draft !== null && draft.chapters.length > 0 && styleId.length > 0;

  const handleStartJourney = () => {
    if (!startable || journeyId === null) {
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

  const syllabusBody = journeyId !== null ? { journeyId, styleId } : undefined;

  return (
    <ChatPageShell>
      <ChatPageShell.Content>
        {creatingJourney && messages.length === 0 ? (
          <p className="text-muted-foreground px-1 text-sm">
            {t('creatingJourney')}
          </p>
        ) : null}
        <JourneyChatView
          MessagePartDelegate={SyllabusPartDelegate}
          disableInput={journeyId === null}
          messages={messages}
          placeholder={t('promptPlaceholder')}
          status={status}
          onEditUserMessage={
            syllabusBody !== undefined
              ? (messageId, text) =>
                  handleEditMessage({ messageId, text, body: syllabusBody })
              : undefined
          }
          onRegenerate={
            syllabusBody !== undefined
              ? (messageId) =>
                  handleRegenerate({ messageId, body: syllabusBody })
              : undefined
          }
          onStop={stop}
          onSubmit={(msg) => {
            if (syllabusBody === undefined) {
              return;
            }
            void handleSubmit({ ...msg, body: syllabusBody });
          }}
        />
        {startable && journeyId !== null && (
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
