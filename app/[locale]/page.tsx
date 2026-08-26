import { auth } from '@clerk/nextjs/server';

import { listPresets } from '@/lib/styles/get';
import { ensureUser } from '@/lib/users/ensure';

import { Hero } from './hero';

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
