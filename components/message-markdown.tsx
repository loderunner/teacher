'use client';

import { Streamdown } from 'streamdown';

import { streamdownPlugins } from '@/lib/streamdown';

type Props = {
  children: string;
  streaming?: boolean;
};

/**
 * Renders Markdown content for a chat message using Streamdown.
 * Shows a blinking block caret while streaming.
 *
 * @param children - The Markdown string to render.
 * @param streaming - When `true`, displays a caret to indicate active streaming.
 */
export function MessageMarkdown({ children, streaming = false }: Props) {
  return (
    <Streamdown
      caret={streaming ? 'block' : undefined}
      plugins={streamdownPlugins}
    >
      {children}
    </Streamdown>
  );
}
