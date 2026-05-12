import { cache } from 'react';

import { db } from '@/lib/server/db';
import { users } from '@/lib/server/db/schema';

/**
 * Ensures a user row exists for the given Clerk user ID, creating it if absent.
 * Cached per request so multiple calls within one request are deduplicated.
 *
 * @param clerkUserId - The Clerk `userId` from `auth()`.
 */
export const ensureUser = cache(async (clerkUserId: string) => {
  await db.insert(users).values({ id: clerkUserId }).onConflictDoNothing();
});
