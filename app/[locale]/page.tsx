import { auth } from "@clerk/nextjs/server";
import { useTranslations } from "next-intl";

import { ensureUser } from "@/lib/server/users/ensure";

export default async function Home() {
  const { userId } = await auth();
  await ensureUser({ clerkUserId: userId! });

  return <HomeContent />;
}

function HomeContent() {
  const t = useTranslations("Home");
  return (
    <main className="flex flex-1 items-center justify-center">
      <h1 className="text-2xl font-semibold">{t("comingSoon")}</h1>
    </main>
  );
}
