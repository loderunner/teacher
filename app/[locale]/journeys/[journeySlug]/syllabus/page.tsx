import { auth } from '@clerk/nextjs/server';
import { notFound } from 'next/navigation';

import { SyllabusChat } from './syllabus-chat';
import { SyllabusView } from './syllabus-view';

import { permanentRedirect } from '@/lib/i18n/navigation';
import { getJourney } from '@/lib/journeys/get';
import { getMessages } from '@/lib/messages';
import { listPresets } from '@/lib/styles/get';
import { journeyPath, journeySlugSegment, parseJourneySlug } from '@/lib/url';
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
  if (journeySlug !== journeySlugSegment(journey.id, journey.title)) {
    permanentRedirect({ href: `${canonicalJourney}/syllabus`, locale });
  }

  const messages = await getMessages({
    journeyId: journey.id,
    chapterId: null,
  });

  if (journey.status === 'drafting') {
    return (
      <SyllabusChat
        initialMessages={messages}
        journey={journey}
        presets={listPresets()}
      />
    );
  }

  return <SyllabusView journey={journey} locale={locale} messages={messages} />;
}
