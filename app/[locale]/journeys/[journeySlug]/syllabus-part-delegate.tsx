'use client';

import { CheckIcon } from '@phosphor-icons/react';
import type { UIMessage } from 'ai';
import { useTranslations } from 'next-intl';

import type { MessagePartDelegateProps } from '@/lib/journey-chat/view';

/** Renders `tool-updateSyllabusDraft` parts inline in the conversation. */
export function SyllabusPartDelegate({
  part,
}: MessagePartDelegateProps<UIMessage>) {
  const t = useTranslations('Welcome');

  if (part.type !== 'tool-updateSyllabusDraft') {
    return null;
  }

  if (part.state !== 'output-available') {
    return (
      <div className="text-muted-foreground not-prose flex items-center gap-2 text-xs">
        <span className="flex gap-0.5">
          <span className="animate-pulse">•</span>
          <span className="animate-pulse [animation-delay:200ms]">•</span>
          <span className="animate-pulse [animation-delay:400ms]">•</span>
        </span>
        <span>{t('updatingSyllabus')}</span>
      </div>
    );
  }

  return (
    <div className="text-muted-foreground not-prose flex items-center gap-2 text-xs">
      <CheckIcon size={12} />
      <span>{t('syllabusUpdated')}</span>
    </div>
  );
}
