'use client';

import { CaretRightIcon } from '@phosphor-icons/react';
import type { UIMessage } from 'ai';
import { useTranslations } from 'next-intl';
import { type ComponentType, useState } from 'react';

import { formatSyllabusMarkdown } from './syllabus-markdown';

import { JourneyChatView } from '@/lib/chat';
import {
  Message,
  MessageContent,
  MessageEvent,
  MessageResponse,
} from '@/lib/components/ai-elements/message';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/lib/components/ui/collapsible';
import { type Syllabus } from '@/lib/syllabus/schema';
import { cn } from '@/lib/tailwind';

type JourneyChatViewIslandProps = {
  messages: UIMessage[];
  tools?: Record<string, ComponentType>;
  /**
   * Markdown of the activated syllabus, shown after the transcript behind a
   * "Journey started" marker. Omit for the drafting phase.
   */
  syllabus: Syllabus | null;
};

export function JourneyChatViewIsland({
  messages,
  tools,
  syllabus,
}: JourneyChatViewIslandProps) {
  const t = useTranslations('SyllabusPage');
  const [open, setOpen] = useState(false);

  const syllabusMarkdown =
    syllabus !== null ? formatSyllabusMarkdown(syllabus) : null;

  const resultingSyllabus =
    syllabusMarkdown !== null ? (
      <>
        <MessageEvent>{t('journeyStarted')}</MessageEvent>
        <Message from="assistant">
          <MessageContent>
            <Collapsible open={open} onOpenChange={setOpen}>
              <CollapsibleTrigger className="flex w-full items-center gap-1.5 text-sm font-semibold">
                <CaretRightIcon
                  className={cn(
                    'transition-transform',
                    open ? 'rotate-90' : 'rotate-0',
                  )}
                  size={14}
                  weight="bold"
                />
                {t('resultingSyllabus')}
              </CollapsibleTrigger>
              <CollapsibleContent className="data-open:animate-collapsible-down data-closed:animate-collapsible-up overflow-hidden">
                <div className="h-(--collapsible-panel-height) data-ending-style:h-0 data-starting-style:h-0">
                  <div className="pt-2">
                    <MessageResponse>{syllabusMarkdown}</MessageResponse>
                  </div>
                </div>
              </CollapsibleContent>
            </Collapsible>
          </MessageContent>
        </Message>
      </>
    ) : null;

  return (
    <JourneyChatView
      messages={messages}
      placeholder=""
      readOnly
      status="ready"
      tools={tools}
    >
      {resultingSyllabus}
    </JourneyChatView>
  );
}
