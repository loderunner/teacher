'use client';

import { CheckIcon } from '@phosphor-icons/react';
import { type DeepPartial } from 'ai';
import { useTranslations } from 'next-intl';

import * as SidebarSection from './sidebar-section';
import {
  type DisplayChapter,
  buildActivatedChapters,
  buildDraftChapters,
} from './syllabus-panel-data';

import {
  Accordion,
  AccordionContent,
  AccordionHeader,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Link } from '@/i18n/navigation';
import type { Journey } from '@/lib/server/journeys/get';
import type { Syllabus } from '@/lib/server/syllabus/schema';
import { cn } from '@/lib/tailwind';
import { journeyPath } from '@/lib/url';

/** Identifies which item in the panel is currently active (activated mode only). */
export type Current = { type: 'syllabus' } | { type: 'chapter'; idx: number };

/** Props for {@link SyllabusPanel}. */
export type Props =
  | {
      /** Renders a draft syllabus preview — no links, muted status. */
      mode: 'draft';
      /** Partial syllabus built up by the AI during the drafting chat. */
      draft: DeepPartial<Syllabus> | null;
    }
  | {
      /** Renders the activated journey syllabus with navigation links. */
      mode: 'activated';
      /** Fully activated journey with chapters and syllabus. */
      journey: Journey;
      /** Which item in the panel is currently active. */
      current: Current;
    };

type ChapterItemProps = {
  index: number;
  chapter: DisplayChapter;
  current: boolean;
};

function ChapterItem({ index, chapter, current }: ChapterItemProps) {
  const triggerClassName = cn(
    'flex flex-1 flex-col gap-1 py-2.5 pr-2',
    current && 'bg-muted rounded px-2 font-bold',
    {
      'text-muted-foreground':
        chapter.status === 'locked' || chapter.status === 'draft' || !current,
    },
  );
  const triggerText = (
    <span className="text-sm font-medium">
      {chapter.status === 'done' && (
        <CheckIcon className="mr-1 inline-block" size={12} />
      )}
      {index + 1}. {chapter.title ?? '…'}
    </span>
  );
  const triggerContent =
    chapter.href !== undefined ? (
      <Link className={triggerClassName} href={chapter.href}>
        {triggerText}
      </Link>
    ) : (
      <div className={triggerClassName}>{triggerText}</div>
    );

  const summaryContent =
    chapter.summary !== undefined ? (
      <span className="font-sans text-xs font-normal">{chapter.summary}</span>
    ) : null;
  const sectionsContent =
    chapter.sections !== undefined && chapter.sections.length > 0 ? (
      <ul className="ml-4 flex flex-col gap-0.5">
        {chapter.sections.map((section, j) => (
          <li key={j} className="text-muted-foreground list-disc text-xs">
            {section}
          </li>
        ))}
      </ul>
    ) : null;

  return (
    <AccordionItem value={`chapter-${index}`}>
      <AccordionTrigger>{triggerContent}</AccordionTrigger>
      <AccordionContent>
        {summaryContent}
        {sectionsContent}
      </AccordionContent>
    </AccordionItem>
  );
}

type SyllabusItemProps = {
  journey: Journey;
  current: boolean;
};

function SyllabusItem({ journey, current }: SyllabusItemProps) {
  const t = useTranslations('Chapter');

  return (
    <AccordionItem disabled value="syllabus">
      <AccordionHeader>
        <Link
          className={cn(
            'focus-visible:border-ring focus-visible:ring-ring/50 relative flex flex-1 items-start rounded-lg border border-transparent py-2.5 text-sm font-medium transition-all outline-none hover:underline focus-visible:ring-3',
            current && 'bg-muted rounded px-2 font-medium',
            !current && 'text-muted-foreground',
          )}
          href={`${journeyPath(journey.id, journey.title)}/syllabus`}
        >
          {t('syllabusChat')}
        </Link>
      </AccordionHeader>
    </AccordionItem>
  );
}

/**
 * Sidebar panel that displays the journey syllabus as a collapsible accordion.
 *
 * In `draft` mode shows a live preview of the AI-generated outline with no
 * navigation links. In `activated` mode shows the live journey chapters with
 * status indicators and links to unlocked chapters.
 *
 * @example
 * // Draft (syllabus-building chat)
 * <SyllabusPanel mode="draft" draft={partialDraft} />
 *
 * // Activated (chapter or syllabus page)
 * <SyllabusPanel mode="activated" journey={journey} current={{ type: 'chapter', idx: 2 }} />
 */
export function SyllabusPanel(props: Props) {
  const t = useTranslations('Chapter');

  let chapters: DisplayChapter[];
  if (props.mode === 'draft') {
    chapters = buildDraftChapters(props.draft);
  } else {
    chapters = buildActivatedChapters(props.journey);
  }

  const syllabusCurrent =
    props.mode === 'activated' && props.current.type === 'syllabus';
  const currentChapterIndex =
    props.mode === 'activated' && props.current.type === 'chapter'
      ? props.current.idx
      : undefined;

  const body =
    chapters.length === 0 ? (
      <p className="text-muted-foreground text-sm">{t('emptyDraft')}</p>
    ) : (
      <Accordion className="flex flex-col">
        {props.mode === 'activated' && (
          <SyllabusItem current={syllabusCurrent} journey={props.journey} />
        )}
        {chapters.map((chapter, i) => (
          <ChapterItem
            key={i}
            chapter={chapter}
            current={currentChapterIndex === i}
            index={i}
          />
        ))}
      </Accordion>
    );

  return (
    <SidebarSection.Root>
      <SidebarSection.Header>{t('syllabusHeader')}</SidebarSection.Header>
      <SidebarSection.Body>{body}</SidebarSection.Body>
    </SidebarSection.Root>
  );
}
