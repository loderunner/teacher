'use client';

import { ArrowRightIcon } from '@phosphor-icons/react';
import {
  type DeepPartial,
  type InferUITools,
  type ToolUIPart,
  type UIDataTypes,
  type UIMessage,
} from 'ai';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState, useTransition } from 'react';

import { createJourneyAction } from './create-journey';
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
import type { Syllabus } from '@/lib/server/syllabus/schema';
import { type updateSyllabusDraft } from '@/lib/syllabus-chat/tool';

type SyllabusChatTools = InferUITools<{
  updateSyllabusDraft: typeof updateSyllabusDraft;
}>;

/** Typed UIMessage for the syllabus-building chat session. */
export type SyllabusChatUIMessage = UIMessage<
  unknown,
  UIDataTypes,
  SyllabusChatTools
>;

type SyllabusDraftToolPart = ToolUIPart<SyllabusChatTools>;

function isSyllabusDraftToolPart(
  part: SyllabusChatUIMessage['parts'][number],
): part is SyllabusDraftToolPart {
  return part.type === 'tool-updateSyllabusDraft';
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

/** Props for {@link SyllabusChat}. */
type Props = {
  /** Available teaching style presets. */
  presets: Style[];
};

/**
 * Syllabus-building chat page that reads the initial message from
 * sessionStorage (written by the hero) and streams responses from
 * `/api/syllabus/chat`. Renders the draft panel and style picker in
 * the sidebar.
 */
export function SyllabusChat({ presets }: Props) {
  const t = useTranslations('Welcome');
  const router = useRouter();

  const defaultStyleId = presets.length > 0 ? presets[0].id : 'teacher';

  // retrieveInitialDraft does NOT remove the entry — safe to call here because
  // React StrictMode invokes lazy initializers twice, and both calls must see
  // the same data.
  const [hasDraft] = useState(() => retrieveInitialDraft() !== null);
  const [styleId, setStyleId] = useState<string>(
    () => retrieveInitialDraft()?.styleId ?? defaultStyleId,
  );
  const [pending, startTransition] = useTransition();

  const {
    messages,
    status,
    stop,
    streaming,
    handleSubmit,
    handleRegenerate,
    handleEditMessage,
  } = useJourneyChat<SyllabusChatUIMessage>({ api: '/api/syllabus/chat' });

  // The hydratedRef guard prevents StrictMode's double-effect from sending the
  // first message twice. clearInitialDraft removes the entry so a page refresh
  // does not re-submit.
  const hydratedRef = useRef(false);
  useEffect(() => {
    if (hydratedRef.current) {
      return;
    }
    hydratedRef.current = true;

    const draft = retrieveInitialDraft();
    clearInitialDraft();

    if (draft === null) {
      router.replace('/');
      return;
    }

    handleSubmit({
      text: draft.text,
      files: [],
      body: { styleId: draft.styleId },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!hasDraft) {
    return null;
  }

  const { draft, partialDraft } = deriveDrafts(messages);

  const started = messages.length > 0;
  const startable =
    draft !== null && draft.chapters.length > 0 && styleId.length > 0;

  const handleStartJourney = () => {
    if (!startable) {
      return;
    }
    const syllabus = draft;
    startTransition(async () => {
      const result = await createJourneyAction({ messages, syllabus, styleId });
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
            handleEditMessage({ messageId, text, body: { styleId } })
          }
          onRegenerate={(messageId) =>
            handleRegenerate({ messageId, body: { styleId } })
          }
          onStop={stop}
          onSubmit={(msg) => handleSubmit({ ...msg, body: { styleId } })}
        />
        {startable && (
          <div className="mx-auto flex w-full max-w-3xl justify-end px-1 pb-1">
            <button
              className="border-foreground bg-foreground text-background flex items-center gap-2 rounded border px-4 py-2 text-sm font-medium transition-opacity disabled:opacity-40"
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
