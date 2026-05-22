import type { UIMessage } from 'ai';
import { getTranslations } from 'next-intl/server';

import { SyllabusPartDelegate } from './syllabus-part-delegate';

import { ChatPageShell, Title } from '@/components/chat-page';
import { StyleLabel, SyllabusPanel } from '@/components/journey';
import { JourneyChatView } from '@/lib/journey-chat';
import type { Journey } from '@/lib/server/journeys/get';

/** Props for {@link SyllabusView}. */
type Props = {
  /** Activated journey whose syllabus is being displayed. */
  journey: Journey;
  /** Persisted syllabus-chat messages. */
  messages: UIMessage[];
  /** Next-intl locale for server-side translation. */
  locale: string;
};

/**
 * Read-only view of the activated journey's syllabus chat transcript.
 * Shown when the journey is in the `active` state.
 */
export async function SyllabusView({ journey, messages, locale }: Props) {
  const t = await getTranslations({ locale, namespace: 'SyllabusPage' });

  return (
    <ChatPageShell.Root>
      <ChatPageShell.Content>
        <ChatPageShell.Header>
          <Title>{t('header')}</Title>
        </ChatPageShell.Header>
        <JourneyChatView
          MessagePartDelegate={SyllabusPartDelegate}
          messages={messages}
          placeholder=""
          readOnly
          status="ready"
        />
      </ChatPageShell.Content>
      <ChatPageShell.Sidebar>
        <SyllabusPanel
          current={{ type: 'syllabus' }}
          journey={journey}
          mode="activated"
        />
        <StyleLabel styleId={journey.styleId} />
      </ChatPageShell.Sidebar>
    </ChatPageShell.Root>
  );
}
