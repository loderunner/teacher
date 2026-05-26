import { auth } from '@clerk/nextjs/server';
import { useTranslations } from 'next-intl';

import { Link } from '@/i18n/navigation';
import { listJourneys } from '@/lib/server/journeys/list';
import { ensureUser } from '@/lib/server/users/ensure';
import { journeyPath } from '@/lib/url';

export default async function JourneysPage() {
  const { userId } = await auth();
  await ensureUser(userId!);

  const items = await listJourneys({ userId: userId! });

  return <JourneysView items={items} />;
}

type JourneysViewProps = {
  items: Awaited<ReturnType<typeof listJourneys>>;
};

function JourneysView({ items }: JourneysViewProps) {
  const t = useTranslations('Journeys');

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="font-heading text-2xl font-semibold">{t('title')}</h1>
        <Link className="text-sm underline underline-offset-4" href="/">
          {t('newJourney')}
        </Link>
      </div>
      {items.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t('empty')}</p>
      ) : (
        <ul className="flex flex-col divide-y">
          {items.map((item) => (
            <li key={item.id}>
              <Link
                className="block py-3 text-sm hover:underline"
                href={journeyPath(item.id, item.title)}
              >
                {item.title}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
