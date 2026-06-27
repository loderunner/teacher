import { useTranslations } from 'next-intl';

import { Badge } from '@/lib/components/ui/badge';
import { Link } from '@/lib/i18n/navigation';
import { cn } from '@/lib/tailwind';

/** Props for {@link JourneyCard}. */
type JourneyCardProps = {
  /** Locale-aware URL to navigate to on click. */
  href: string;
  /** Journey title. */
  title: string;
  /** Teaching style preset ID, e.g. `"teacher"`. */
  styleId: string;
  /** Total number of chapters in the syllabus. */
  chapterCount: number;
  /**
   * 1-based index of the current chapter. `null` for drafting journeys that
   * have not yet been activated.
   */
  currentChapterNumber: number | null;
  /** Pre-formatted relative time string, e.g. `"2 days ago"`. */
  relativeDate: string;
};

const STYLE_KEYS = ['teacher', 'tutorial', 'adventure'] as const;
type StyleKey = (typeof STYLE_KEYS)[number];

const isStyleKey = (s: string): s is StyleKey =>
  (STYLE_KEYS as readonly string[]).includes(s);

/**
 * Card displaying a single journey summary — title, style, chapter progress,
 * and relative last-updated time. The entire card is a navigation link.
 *
 * @param href - Locale-aware URL for the journey.
 * @param title - Journey title.
 * @param styleId - Teaching style preset ID.
 * @param chapterCount - Total number of chapters in the syllabus.
 * @param currentChapterNumber - 1-based current chapter, or `null` for drafts.
 * @param relativeDate - Pre-formatted relative time (e.g. "2 days ago").
 */
export function JourneyCard({
  href,
  title,
  styleId,
  chapterCount,
  currentChapterNumber,
  relativeDate,
}: JourneyCardProps) {
  const t = useTranslations('Journeys');
  const tStyle = useTranslations('StylePicker');

  const metaItems =
    currentChapterNumber !== null
      ? [
          t('chapterProgress', {
            current: currentChapterNumber,
            total: chapterCount,
          }),
          relativeDate,
        ]
      : [t('draft'), t('chapters', { count: chapterCount }), relativeDate];

  return (
    <Link
      className={cn(
        'block rounded-lg border p-4 transition-colors',
        'hover:bg-muted/50',
      )}
      href={href}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-sm font-medium">{title}</span>
        <Badge variant="secondary">
          {isStyleKey(styleId) ? tStyle(styleId) : styleId}
        </Badge>
      </div>
      <div className="text-muted-foreground mt-2 flex items-center gap-1.5 text-xs">
        {metaItems.map((item, i) => (
          <span key={i} className="flex items-center gap-1.5">
            {i > 0 && <span aria-hidden>•</span>}
            {item}
          </span>
        ))}
      </div>
    </Link>
  );
}
