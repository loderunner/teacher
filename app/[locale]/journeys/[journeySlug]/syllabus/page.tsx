import { auth } from '@clerk/nextjs/server';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

import { SyllabusPartDelegate } from '../syllabus-part-delegate';

import { JourneyChatView } from '@/lib/journey-chat';
import { getJourney } from '@/lib/server/journeys/get';
import { getMessages } from '@/lib/server/messages';
import { ensureUser } from '@/lib/server/users/ensure';
import { parseJourneySlug } from '@/lib/url';

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

  if (journey.status !== 'active') {
    notFound();
  }

  const messages = await getMessages({
    journeyId: journey.id,
    chapterId: null,
  });

  const t = await getTranslations({ locale, namespace: 'SyllabusPage' });

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-8">
      <header className="flex flex-col gap-2">
        <h1 className="font-heading text-2xl font-bold">{t('header')}</h1>
        <p className="text-muted-foreground text-sm">{t('description')}</p>
      </header>
      <JourneyChatView
        MessagePartDelegate={SyllabusPartDelegate}
        messages={messages}
        placeholder=""
        readOnly
        status="ready"
        onSubmit={() => {}}
      />
    </div>
  );
}
