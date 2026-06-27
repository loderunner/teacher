import type { UIMessage } from 'ai';
import { getTranslations } from 'next-intl/server';
import type { ComponentType } from 'react';

import { JourneyChatViewIsland } from './journey-chat-view-island';
import { SyllabusDraftDisplay } from './syllabus-draft-display';

import { ChatPageShell, Title } from '@/lib/components/chat-page';
import { StyleLabel, SyllabusPanel } from '@/lib/components/journey';
import type { Journey } from '@/lib/journeys/get';

const SYLLABUS_TOOLS: Record<string, ComponentType> = {
  'tool-updateSyllabusDraft': SyllabusDraftDisplay,
};

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
        <JourneyChatViewIsland messages={messages} tools={SYLLABUS_TOOLS} />
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
