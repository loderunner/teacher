import { auth } from '@clerk/nextjs/server';
import { notFound } from 'next/navigation';

import { permanentRedirect, redirect } from '@/i18n/navigation';
import { getJourney } from '@/lib/journeys/get';
import { chapterPath, journeyPath, parseJourneySlug } from '@/lib/url';
import { ensureUser } from '@/lib/users/ensure';

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

  if (journey.status === 'drafting' || journey.chapters.length === 0) {
    const syllabusHref = `${canonicalJourney}/syllabus`;
    redirect({ href: syllabusHref, locale });
  }

  const target =
    journey.chapters.find((c) => c.status === 'active') ??
    [...journey.chapters].reverse().find((c) => c.status === 'done') ??
    journey.chapters[0];

  const chapterHref = chapterPath(journey, target);
  redirect({ href: chapterHref, locale });
}
