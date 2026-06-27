import type { UIMessage } from 'ai';
import { sql } from 'drizzle-orm';

import { db } from '@/lib/db';
import { messages } from '@/lib/db/schema';

/** Parameters for appending messages to a conversation scope. */
export type SaveMessagesParams = {
  /** Owning journey. */
  journeyId: string;
  /** `null` = syllabus chat scope; a chapter id = chapter chat scope. */
  chapterId: string | null;
  /**
   * Messages to insert. Existing ids are updated (idempotent on retry).
   * Persists `metadata` alongside role and parts.
   */
  messages: UIMessage[];
};

/**
 * Inserts messages into a conversation scope. Upserts by id so a retried
 * request does not duplicate rows. Does not delete — callers truncate with
 * {@link deleteMessagesFrom} first when replacing history.
 *
 * @param params - Journey scope and the messages to persist.
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
      uiMessages.map((m) => ({
        id: m.id,
        journeyId,
        chapterId,
        role: m.role,
        parts: m.parts,
        metadata: m.metadata ?? null,
      })),
    )
    .onConflictDoUpdate({
      target: messages.id,
      set: {
        role: sql`excluded.role`,
        parts: sql`excluded.parts`,
        metadata: sql`excluded.metadata`,
      },
    });
}
