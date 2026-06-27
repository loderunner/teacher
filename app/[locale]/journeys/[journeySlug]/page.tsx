import { auth } from '@clerk/nextjs/server';
import { notFound } from 'next/navigation';

import { permanentRedirect, redirect } from '@/lib/i18n/navigation';
import { getJourney } from '@/lib/journeys/get';
import { parseJourneySlug } from '@/lib/url';
import { ensureUser } from '@/lib/users/ensure';
import { canonicalPath } from './url';
import { canonicalPath as syllabusCanonicalPath } from './syllabus/url';
import { canonicalPath as chapterCanonicalPath } from './[chapterSlug]/url';

export default async function Page({
  params,
}: {
  params: Promise<{ journeySlug: string; locale: string }>;
}) {
  const { journeySlug, locale } = await params;
  const parsed = parseJourneySlug(journeySlug);
  if (parsed === null) {
    notFound();
  }

  const { userId } = await auth();
  await ensureUser(userId!);

  const journey = await getJourney({ userId: userId!, id: parsed.id });
  if (journey === null) {
    notFound();
  }

  if (`/journeys/${journeySlug}` !== canonicalPath(journey)) {
    permanentRedirect({ href: canonicalPath(journey), locale });
  }

  if (journey.status === 'drafting' || journey.chapters.length === 0) {
    redirect({ href: syllabusCanonicalPath(journey), locale });
  }

  const target =
    journey.chapters.find((c) => c.status === 'active') ??
    [...journey.chapters].reverse().find((c) => c.status === 'done') ??
    journey.chapters[0];

  redirect({ href: chapterCanonicalPath(journey, target), locale });
}
