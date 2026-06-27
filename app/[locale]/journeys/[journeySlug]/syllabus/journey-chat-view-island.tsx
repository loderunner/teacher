'use client';

import type { UIMessage } from 'ai';
import type { ComponentType } from 'react';

import { JourneyChatView } from '@/lib/chat';

type JourneyChatViewIslandProps = {
  messages: UIMessage[];
  tools?: Record<string, ComponentType>;
};

export function JourneyChatViewIsland({
  messages,
  tools,
}: JourneyChatViewIslandProps) {
  return (
    <JourneyChatView
      messages={messages}
      placeholder=""
      readOnly
      status="ready"
      tools={tools}
    />
  );
}
