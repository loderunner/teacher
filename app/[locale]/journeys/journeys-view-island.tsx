'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';

import { JourneyCard } from './journey-card';

import {
  type JourneySummary,
  listJourneysResponseSchema,
} from '@/lib/api/journeys';
import { Button } from '@/lib/components/ui/button';
import { Input } from '@/lib/components/ui/input';
import { Link } from '@/lib/i18n/navigation';
import { journeyPath } from '@/lib/url';

/** Props for {@link JourneysViewIsland}. */
type JourneysViewIslandProps = {
  /** Initial page of journey summaries fetched server-side. */
  initialItems: JourneySummary[];
  /**
   * Opaque page token for the next page, as returned by the server.
   * `null` when there are no further pages.
   */
  nextPageToken: string | null;
};

const formatRelativeDate = (date: Date, locale: string): string => {
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  const diffMs = date.getTime() - Date.now();
  const diffDays = Math.round(diffMs / 86_400_000);
  const diffHours = Math.round(diffMs / 3_600_000);
  const diffMinutes = Math.round(diffMs / 60_000);
  if (Math.abs(diffDays) >= 1) {
    return rtf.format(diffDays, 'day');
  }
  if (Math.abs(diffHours) >= 1) {
    return rtf.format(diffHours, 'hour');
  }
  return rtf.format(diffMinutes, 'minute');
};

const PAGE_LIMIT = 10;

/**
 * Client island for the journeys list page. Owns search state, "load more"
 * pagination, and renders {@link JourneyCard} for each item.
 */
export function JourneysViewIsland({
  initialItems,
  nextPageToken: initialPageToken,
}: JourneysViewIslandProps) {
  const t = useTranslations('Journeys');
  const tStyle = useTranslations('StylePicker');
  const locale = useLocale();

  const [items, setItems] = useState<JourneySummary[]>(initialItems);
  const [pageToken, setPageToken] = useState<string | null>(initialPageToken);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);

  const searchText = (item: JourneySummary): string =>
    [
      item.title,
      tStyle(item.styleId),
      item.status === 'drafting' ? t('draftBadge') : '',
    ]
      .join(' ')
      .toLowerCase();

  const filtered =
    query.trim() === ''
      ? items
      : items.filter((item) => searchText(item).includes(query.toLowerCase()));

  const handleLoadMore = async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/journeys?limit=${PAGE_LIMIT}&pageToken=${pageToken}`,
      );
      if (!res.ok) {
        return;
      }
      const data = listJourneysResponseSchema.parse(await res.json());
      setItems((prev) => [...prev, ...data.items]);
      setPageToken(data.nextPageToken ?? null);
    } finally {
      setLoading(false);
    }
  };

  const emptyMessage =
    query.trim() !== '' ? (
      <p className="text-muted-foreground text-sm">{t('noResults')}</p>
    ) : (
      <p className="text-muted-foreground text-sm">{t('empty')}</p>
    );

  return (
    <main className="mx-auto flex min-h-0 w-full max-w-2xl flex-1 flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="font-heading text-2xl font-semibold">{t('title')}</h1>
        <Link className="text-sm underline underline-offset-4" href="/">
          {t('newJourney')}
        </Link>
      </div>
      <Input
        placeholder={t('searchPlaceholder')}
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {filtered.length === 0 ? (
        emptyMessage
      ) : (
        <ul className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
          {filtered.map((item) => (
            <li key={item.id}>
              <JourneyCard
                chapterCount={item.chapterCount}
                currentChapterNumber={item.currentChapterNumber}
                href={journeyPath(item)}
                relativeDate={formatRelativeDate(item.updatedAt, locale)}
                styleId={item.styleId}
                title={item.title}
              />
            </li>
          ))}
          {pageToken !== null && (
            <li className="flex justify-end pt-3 pb-1">
              <Button
                disabled={loading}
                variant="outline"
                onClick={handleLoadMore}
              >
                {t('loadMore')}
              </Button>
            </li>
          )}
        </ul>
      )}
    </main>
  );
}
