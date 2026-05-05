import { cache } from "react";

import { db } from "@/lib/server/db";
import { users } from "@/lib/server/db/schema";

export const ensureUser = cache(
  async ({ clerkUserId }: { clerkUserId: string }) => {
    await db.insert(users).values({ id: clerkUserId }).onConflictDoNothing();
  },
);
