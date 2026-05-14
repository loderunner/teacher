import { auth } from '@clerk/nextjs/server';

import { SyllabusChat } from './syllabus-chat';

import { listPresets } from '@/lib/server/styles/get';
import { ensureUser } from '@/lib/server/users/ensure';

export default async function Page() {
  const { userId } = await auth();
  await ensureUser(userId!);

  const presets = listPresets();

  return (
    <main className="flex flex-1 flex-col overflow-hidden">
      <SyllabusChat presets={presets} />
    </main>
  );
}
