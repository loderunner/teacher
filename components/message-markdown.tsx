'use client';

import { code } from '@streamdown/code';
import { Streamdown } from 'streamdown';

type Props = {
  children: string;
  streaming?: boolean;
};

export function MessageMarkdown({ children, streaming = false }: Props) {
  return (
    <Streamdown caret={streaming ? 'block' : undefined} plugins={{ code }}>
      {children}
    </Streamdown>
  );
}
