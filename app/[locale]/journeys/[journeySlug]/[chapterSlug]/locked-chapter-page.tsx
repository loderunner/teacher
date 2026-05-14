import { useTranslations } from 'next-intl';

import { StyleLabel } from './style-label';
import { SyllabusPanel } from './syllabus-panel';

import { ChatPageShell } from '@/components/chat-page-shell';
import { Link } from '@/i18n/navigation';
import type { Journey, JourneyChapter } from '@/lib/server/journeys/get';

/** Props for {@link LockedChapterPage}. */
type Props = {
  /** The journey this chapter belongs to. */
  journey: Journey;
  /** The locked chapter being viewed. */
  chapter: JourneyChapter;
  /**
   * Path of the current active chapter to link to.
   * `undefined` when no active chapter exists (all chapters are done).
   */
  activeChapterPath: string | undefined;
};

/** Full-page layout for a locked chapter — shows position, title, and a link to the active chapter. */
export function LockedChapterPage({
  journey,
  chapter,
  activeChapterPath,
}: Props) {
  const t = useTranslations('Chapter');

  return (
    <ChatPageShell>
      <ChatPageShell.Content>
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
          <div className="flex flex-col gap-1">
            <p className="text-muted-foreground text-sm">
              {t('position', {
                n: chapter.idx + 1,
                total: journey.chapters.length,
              })}
            </p>
            <h1 className="text-3xl font-bold">{chapter.title}</h1>
          </div>
          <div className="flex flex-col gap-4">
            <p className="text-muted-foreground">{t('locked')}</p>
            {activeChapterPath !== undefined && (
              <Link
                className="underline hover:no-underline"
                href={activeChapterPath}
              >
                {t('goToActiveChapter')}
              </Link>
            )}
          </div>
        </div>
      </ChatPageShell.Content>
      <ChatPageShell.Sidebar>
        <SyllabusPanel currentIdx={chapter.idx} journey={journey} />
        <StyleLabel styleId={journey.styleId} />
      </ChatPageShell.Sidebar>
    </ChatPageShell>
  );
}
