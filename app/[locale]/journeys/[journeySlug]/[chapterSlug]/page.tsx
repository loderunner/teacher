import { auth } from '@clerk/nextjs/server';
import { notFound } from 'next/navigation';

import { ChapterPage } from './chapter-page';
import { LockedChapterPage } from './locked-chapter-page';

import { permanentRedirect } from '@/i18n/navigation';
import { getJourney } from '@/lib/server/journeys/get';
import { ensureUser } from '@/lib/server/users/ensure';
import { chapterPath, parseChapterSlug, parseJourneySlug } from '@/lib/url';

export default async function Page({
  params,
}: {
  params: Promise<{
    journeySlug: string;
    chapterSlug: string;
    locale: string;
  }>;
}) {
  const { journeySlug, chapterSlug, locale } = await params;

  const parsedJourney = parseJourneySlug(journeySlug);
  if (parsedJourney === null) {
    notFound();
  }

  const parsedChapter = parseChapterSlug(chapterSlug);
  if (parsedChapter === null) {
    notFound();
  }

  const { userId } = await auth();
  await ensureUser(userId!);

  const journey = await getJourney({ userId: userId!, id: parsedJourney.id });
  if (journey === null) {
    notFound();
  }

  const chapter = journey.chapters.find((c) => c.id === parsedChapter.id);
  if (chapter === undefined) {
    notFound();
  }

  const canonical = chapterPath(journey, chapter);
  if (`/journeys/${journeySlug}/${chapterSlug}` !== canonical) {
    permanentRedirect({ href: canonical, locale });
  }

  if (chapter.status === 'locked') {
    const activeChapter = journey.chapters.find((c) => c.status === 'active');
    const activeChapterPath =
      activeChapter !== undefined
        ? chapterPath(journey, activeChapter)
        : undefined;
    return (
      <LockedChapterPage
        activeChapterPath={activeChapterPath}
        chapter={chapter}
        journey={journey}
      />
    );
  }

  return <ChapterPage chapter={chapter} journey={journey} />;
}
