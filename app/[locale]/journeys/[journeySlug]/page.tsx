import { auth } from '@clerk/nextjs/server';
import { notFound } from 'next/navigation';

import { permanentRedirect, redirect } from '@/i18n/navigation';
import { getJourney } from '@/lib/server/journeys/get';
import { ensureUser } from '@/lib/server/users/ensure';
import { chapterPath, journeyPath, parseJourneySlug } from '@/lib/url';

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

  const canonicalJourney = journeyPath(journey.id, journey.title);
  if (`/journeys/${journeySlug}` !== canonicalJourney) {
    permanentRedirect({ href: canonicalJourney, locale });
  }

  if (journey.status === 'drafting') {
    const syllabusHref = `${canonicalJourney}/syllabus`;
    redirect({ href: syllabusHref, locale });
  }

  if (journey.chapters.length === 0) {
    notFound();
  }

  const target =
    journey.chapters.find((c) => c.status === 'active') ??
    [...journey.chapters].reverse().find((c) => c.status === 'done') ??
    journey.chapters[0];

  const chapterHref = chapterPath(journey, target);
  redirect({ href: chapterHref, locale });
}
