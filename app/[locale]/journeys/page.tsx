import { auth } from '@clerk/nextjs/server';

import { JourneysViewIsland } from './journeys-view-island';

import { getJourneysPage } from '@/app/api/journeys/get';
import { ensureUser } from '@/lib/users/ensure';

const PAGE_LIMIT = 10;

export default async function JourneysPage() {
  const { userId } = await auth();
  await ensureUser(userId!);

  const { items, nextPageToken = null } = await getJourneysPage({
    userId: userId!,
    limit: PAGE_LIMIT,
  });

  return (
    <JourneysViewIsland initialItems={items} nextPageToken={nextPageToken} />
  );
}
