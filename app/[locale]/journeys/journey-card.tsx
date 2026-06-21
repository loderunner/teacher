import { useTranslations } from 'next-intl';

import { Badge } from '@/components/ui/badge';
import { Link } from '@/i18n/navigation';
import { cn } from '@/lib/tailwind';

/** Props for {@link JourneyCard}. */
type JourneyCardProps = {
  /** Locale-aware URL to navigate to on click. */
  href: string;
  /** Journey title. */
  title: string;
  /** Teaching style preset ID, e.g. `"teacher"`. */
  styleId: string;
  /** Number of chapters in the syllabus. */
  chapterCount: number;
  /** Whether the journey is still in the drafting state. */
  drafting: boolean;
  /** Pre-formatted relative time string, e.g. `"2 days ago"`. */
  relativeDate: string;
};

const STYLE_KEYS = ['teacher', 'tutorial', 'adventure'] as const;
type StyleKey = (typeof STYLE_KEYS)[number];

const isStyleKey = (s: string): s is StyleKey =>
  (STYLE_KEYS as readonly string[]).includes(s);

/**
 * Card displaying a single journey summary — title, style, chapter count, and
 * relative last-updated time. The entire card is a navigation link.
 *
 * @param href - Locale-aware URL for the journey.
 * @param title - Journey title.
 * @param styleId - Teaching style preset ID.
 * @param chapterCount - Number of chapters in the syllabus.
 * @param drafting - Whether the journey is still being drafted.
 * @param relativeDate - Pre-formatted relative time (e.g. "2 days ago").
 */
export function JourneyCard({
  href,
  title,
  styleId,
  chapterCount,
  drafting,
  relativeDate,
}: JourneyCardProps) {
  const t = useTranslations('Journeys');
  const tStyle = useTranslations('StylePicker');

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
        <div className="flex shrink-0 items-center gap-1.5">
          {drafting && <Badge variant="outline">{t('draftBadge')}</Badge>}
          <Badge variant="secondary">
            {isStyleKey(styleId) ? tStyle(styleId) : styleId}
          </Badge>
        </div>
      </div>
      <div className="text-muted-foreground mt-2 flex items-center gap-3 text-xs">
        <span>{t('chapters', { count: chapterCount })}</span>
        <span>{relativeDate}</span>
      </div>
    </Link>
  );
}
