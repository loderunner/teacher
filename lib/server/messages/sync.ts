import { and, eq, isNull, notInArray, sql } from 'drizzle-orm';

import type { SaveMessagesParams } from './save';

import { dbTx } from '@/lib/server/db';
import { messages } from '@/lib/server/db/schema';

/**
 * Persists the client's current message list for a scope and removes stale rows.
 *
 * Deletes every stored row for `(journeyId, chapterId)` whose `id` is not in
 * the provided list, then upserts the list (same semantics as {@link saveMessages}).
 * Runs in a single transaction so reloads never see a half-applied branch.
 *
 * When `messages` is empty, all rows for the scope are deleted. This matches
 * a truncated in-memory history (regenerate / edit) without leaving orphan DB
 * rows that {@link getMessages} would surface on reload.
 *
 * **Delta transport:** `docs/plans/delta-message-transport.md` (see branch
 * `cursor/plan-delta-transport-4b90`) replaces the full-array wire with
 * `deleteMessagesFrom` plus additive {@link saveMessages} per turn. Until that
 * protocol ships, routes that accept the full client `messages[]` should use
 * this function so the database stays aligned with the truncated snapshot.
 *
 * @param params - Journey scope and the authoritative message list for that scope.
 */
export async function syncMessages({
  journeyId,
  chapterId,
  messages: uiMessages,
}: SaveMessagesParams): Promise<void> {
  const scopePredicate =
    chapterId === null
      ? and(eq(messages.journeyId, journeyId), isNull(messages.chapterId))
      : and(
          eq(messages.journeyId, journeyId),
          eq(messages.chapterId, chapterId),
        );

  await dbTx.transaction(async (tx) => {
    if (uiMessages.length === 0) {
      await tx.delete(messages).where(scopePredicate);
      return;
    }

    const keptIds = [...new Set(uiMessages.map((message) => message.id))];

    await tx
      .delete(messages)
      .where(and(scopePredicate, notInArray(messages.id, keptIds)));

    await tx
      .insert(messages)
      .values(
        uiMessages.map((message) => ({
          id: message.id,
          journeyId,
          chapterId,
          role: message.role,
          parts: message.parts,
          metadata: message.metadata ?? null,
        })),
      )
      .onConflictDoUpdate({
        target: messages.id,
        set: {
          journeyId: sql`excluded.journey_id`,
          chapterId: sql`excluded.chapter_id`,
          role: sql`excluded.role`,
          parts: sql`excluded.parts`,
          metadata: sql`excluded.metadata`,
        },
      });
  });
}
