import { auth } from '@clerk/nextjs/server';

import { Hero } from './hero';

import { listPresets } from '@/lib/styles/get';
import { ensureUser } from '@/lib/users/ensure';

export default async function Home() {
  const { userId } = await auth();
  await ensureUser(userId!);

  const presets = listPresets();

  return (
    <main className="flex flex-1 flex-col overflow-hidden">
      <Hero presets={presets} />
    </main>
  );
}
