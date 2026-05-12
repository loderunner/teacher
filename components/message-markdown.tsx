'use client';

import { code } from '@streamdown/code';
import { Streamdown } from 'streamdown';

type Props = {
  children: string;
  isStreaming?: boolean;
};

export function MessageMarkdown({ children, isStreaming = false }: Props) {
  return (
    <Streamdown caret={isStreaming ? 'block' : undefined} plugins={{ code }}>
      {children}
    </Streamdown>
  );
}
