import { auth } from '@clerk/nextjs/server';
import { notFound } from 'next/navigation';

import { SyllabusChat } from './syllabus-chat';

import { permanentRedirect, redirect } from '@/i18n/navigation';
import { getJourney } from '@/lib/server/journeys/get';
import { getMessages } from '@/lib/server/messages';
import { listPresets } from '@/lib/server/styles/get';
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

  if (journey.status === 'drafting') {
    const canonicalJourney = journeyPath(journey.id, journey.title);
    if (`/journeys/${journeySlug}` !== canonicalJourney) {
      permanentRedirect({ href: canonicalJourney, locale });
    }

    const initialMessages = await getMessages({
      journeyId: journey.id,
      chapterId: null,
    });
    return (
      <SyllabusChat
        initialMessages={initialMessages}
        journey={journey}
        presets={listPresets()}
      />
    );
  }

  if (journey.chapters.length === 0) {
    notFound();
  }

  const target =
    journey.chapters.find((c) => c.status === 'active') ??
    [...journey.chapters].reverse().find((c) => c.status === 'done') ??
    journey.chapters[0];

  const canonicalJourney = journeyPath(journey.id, journey.title);
  const targetPath = chapterPath(journey, target);

  if (`/journeys/${journeySlug}` !== canonicalJourney) {
    permanentRedirect({ href: targetPath, locale });
  }

  redirect({ href: targetPath, locale });
}
