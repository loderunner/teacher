import type { UIMessage } from 'ai';
import { sql } from 'drizzle-orm';

import { db } from '@/lib/server/db';
import { messages } from '@/lib/server/db/schema';

/** Parameters for bulk-upserting messages into a conversation scope. */
export type SaveMessagesParams = {
  /** Owning journey. */
  journeyId: string;
  /** `null` = syllabus chat scope; a chapter id = chapter chat scope. */
  chapterId: string | null;
  /** Full UI message list to persist (typically the client history for the scope). */
  messages: UIMessage[];
};

/**
 * Upserts UI messages into the messages table.
 * Uses `INSERT … ON CONFLICT (id) DO UPDATE` so resending the same ids is safe.
 *
 * @param params - Journey scope and messages.
 */
export async function saveMessages({
  journeyId,
  chapterId,
  messages: uiMessages,
}: SaveMessagesParams): Promise<void> {
  if (uiMessages.length === 0) {
    return;
  }

  await db
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
}
