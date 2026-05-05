import { auth } from "@clerk/nextjs/server";

import { ensureUser } from "@/lib/server/users/ensure";

export default async function Home() {
  const { userId } = await auth();
  await ensureUser({ clerkUserId: userId! });

  return (
    <main className="flex flex-1 items-center justify-center">
      <h1 className="text-2xl font-semibold">Welcome — coming soon</h1>
    </main>
  );
}
