import { useTranslations } from 'next-intl';

import { StylePickerPersist } from './style-picker-persist';
import { SyllabusPanel } from './syllabus-panel';

import { ChatPageShell } from '@/components/chat-page-shell';
import { Link } from '@/i18n/navigation';
import type { Journey, JourneyChapter } from '@/lib/server/journeys/get';
import type { Style } from '@/lib/server/styles/get';

/** Props for {@link LockedChapterPage}. */
type Props = {
  /** The journey this chapter belongs to. */
  journey: Journey;
  /** The locked chapter being viewed. */
  chapter: JourneyChapter;
  /** Available teaching style presets. */
  presets: Style[];
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
  presets,
  activeChapterPath,
}: Props) {
  const t = useTranslations('Chapter');

  return (
    <ChatPageShell>
      <ChatPageShell.Content>
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
      </ChatPageShell.Content>
      <ChatPageShell.Sidebar>
        <SyllabusPanel currentIdx={chapter.idx} journey={journey} />
        <StylePickerPersist
          initialStyleId={journey.styleId}
          journeyId={journey.id}
          presets={presets}
        />
      </ChatPageShell.Sidebar>
    </ChatPageShell>
  );
}
