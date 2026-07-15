'use client';

import { CheckIcon } from '@phosphor-icons/react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import * as SidebarSection from './sidebar-section';
import {
  type DisplayChapter,
  buildActivatedChapters,
  buildDraftChapters,
  chapterValue,
  collapsible,
  collapsibleChapterValues,
} from './syllabus-panel-data';

import {
  Accordion,
  AccordionContent,
  AccordionHeader,
  AccordionItem,
  AccordionTrigger,
} from '@/lib/components/ui/accordion';
import { Link } from '@/lib/i18n/navigation';
import type { Journey } from '@/lib/journeys/get';
import type { PartialSyllabus, Syllabus } from '@/lib/syllabus/schema';
import { cn } from '@/lib/tailwind';
import { syllabusPath } from '@/lib/url';

/** Identifies which item in the panel is currently active (activated mode only). */
export type Current = { type: 'syllabus' } | { type: 'chapter'; idx: number };

/** Props for {@link SyllabusPanel}. */
export type Props =
  | {
      /** Renders a draft syllabus preview — no links, muted status. */
      mode: 'draft';
      /** Partial or complete syllabus shown while drafting. */
      draft: PartialSyllabus | Syllabus | null;
    }
  | {
      /** Renders the activated journey syllabus with navigation links. */
      mode: 'activated';
      /** Fully activated journey with chapters and syllabus. */
      journey: Journey;
      /** Which item in the panel is currently active. */
      current: Current;
    };

/** State that shapes a title link's interactive and highlight styling. */
type TitleLinkState = {
  /** Whether this item represents the page currently being viewed. */
  current: boolean;
  /** Whether the title text should render in the muted foreground color. */
  status: DisplayChapter['status'];
};

/**
 * Shared classes for a navigable accordion item's title. Both the syllabus
 * link and each chapter's title link render with the same interactive
 * treatment — focus ring, hover underline, current-item highlight — so they
 * read as one family of controls and can't drift apart independently.
 */
function titleLinkClassName({ current, status }: TitleLinkState): string {
  return cn(
    'focus-visible:border-ring focus-visible:ring-ring/50 relative flex flex-1 items-start rounded-lg border border-transparent px-2 py-2.5 text-sm font-medium transition-all outline-none focus-visible:ring-3',
    current && 'bg-muted rounded',
    status === 'locked' && 'text-muted-foreground',
    !current &&
      (status === 'active' || status === 'done') &&
      'not-hover:text-muted-foreground',
  );
}

type ChapterItemProps = {
  index: number;
  chapter: DisplayChapter;
  current: boolean;
};

function ChapterItem({ index, chapter, current }: ChapterItemProps) {
  const t = useTranslations('Chapter');

  const titleClassName = cn(
    titleLinkClassName({
      current,
      status: chapter.status,
    }),
    'flex-col gap-1 pr-2',
  );
  const titleText = (
    <span>
      {chapter.status === 'done' && (
        <CheckIcon className="mr-1 inline-block" size={12} />
      )}
      {index + 1}. {chapter.title ?? '…'}
    </span>
  );
  const title =
    chapter.href !== undefined ? (
      <Link className={titleClassName} href={chapter.href}>
        {titleText}
      </Link>
    ) : (
      <div className={titleClassName}>{titleText}</div>
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
    <AccordionItem value={chapterValue(index)}>
      <AccordionHeader className="items-start gap-1">
        {title}
        {collapsible(chapter) && (
          <AccordionTrigger aria-label={t('toggleSections')} />
        )}
      </AccordionHeader>
      {collapsible(chapter) && (
        <AccordionContent>
          {summaryContent}
          {sectionsContent}
        </AccordionContent>
      )}
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
          className={titleLinkClassName({
            current,
            status: journey.status === 'active' ? 'done' : 'draft',
          })}
          href={syllabusPath(journey)}
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
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

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

  const accordionOpenStateProps =
    props.mode === 'draft'
      ? {
          value: collapsibleChapterValues(chapters).filter(
            (value) => !collapsed.has(value),
          ),
          onValueChange: (next: string[]) => {
            setCollapsed((prev) => {
              const updated = new Set(prev);
              for (const value of collapsibleChapterValues(chapters)) {
                if (next.includes(value)) {
                  updated.delete(value);
                } else {
                  updated.add(value);
                }
              }
              return updated;
            });
          },
        }
      : {
          defaultValue:
            currentChapterIndex !== undefined
              ? [chapterValue(currentChapterIndex)]
              : [],
        };

  const body =
    chapters.length === 0 ? (
      <p className="text-muted-foreground text-sm">{t('emptyDraft')}</p>
    ) : (
      <Accordion
        className="flex flex-col"
        multiple
        {...accordionOpenStateProps}
      >
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
