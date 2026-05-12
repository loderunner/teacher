import { auth } from '@clerk/nextjs/server';
import { notFound } from 'next/navigation';

import { JourneyHome } from './_components/journey-home';

import { permanentRedirect } from '@/i18n/navigation';
import { getJourney } from '@/lib/server/journeys/get';
import { listPresets } from '@/lib/server/styles/get';
import { ensureUser } from '@/lib/server/users/ensure';
import { journeyPath, parseJourneySlug } from '@/lib/url';


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

  const canonical = journeyPath(journey.id, journey.title);
  if (`/journeys/${journeySlug}` !== canonical) {
    permanentRedirect({ href: canonical, locale });
  }

  const presets = listPresets();

  return <JourneyHome journey={journey} presets={presets} />;
}
