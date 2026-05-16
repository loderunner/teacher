'use server';

import { auth } from '@clerk/nextjs/server';
import type { UIMessage } from 'ai';
import { getLocale } from 'next-intl/server';

import { parseLocale } from '@/i18n/locale';
import { checkGuardrail, extractLastUserText } from '@/lib/guardrail';
import { createJourney } from '@/lib/server/journeys/create';
import { type Syllabus, syllabusSchema } from '@/lib/server/syllabus/schema';
import { ensureUser } from '@/lib/server/users/ensure';
import { bootstrapJourney } from '@/lib/syllabus-chat/bootstrap';
import { syllabusTaskDescription } from '@/lib/syllabus-chat/prompts';
import { journeyPath } from '@/lib/url';

/** Input for the {@link createJourneyAction} server action. */
export type CreateJourneyInput = {
  /** Full chat transcript from the syllabus-building session. */
  messages: UIMessage[];
  /** Finalized syllabus draft to persist. */
  syllabus: Syllabus;
  /** Teaching style preset ID chosen by the user. */
  styleId: string;
};

/**
 * Result returned by {@link createJourneyAction}.
 * Either a successfully created journey or a guardrail refusal with a
 * user-facing reason to display in the chat.
 */
export type CreateJourneyResult =
  | {
      /** Journey was created successfully. */
      ok: true;
      /** Newly created journey ID. */
      id: string;
      /** URL path to the journey page, e.g. `/journeys/intro-to-rust-abc1234567`. */
      path: string;
    }
  | {
      /** Request was blocked by the abuse guardrail. */
      ok: false;
      /** User-facing reason to display in the chat. */
      reason: string;
    };

/**
 * Server action that bootstraps and persists a new learning journey.
 * Derives a title and learner memory from the chat transcript, then
 * creates the journey and its chapters in the database.
 *
 * Returns `{ ok: false, reason }` when the guardrail blocks the last
 * user message in the transcript. Throws on system-level errors (auth,
 * database).
 *
 * @param input - Chat messages, syllabus, and style selection.
 * @returns The new journey's ID and URL path, or a guardrail refusal.
 * @throws Error when the caller is not authenticated.
 */
export async function createJourneyAction(
  input: CreateJourneyInput,
): Promise<CreateJourneyResult> {
  const { userId } = await auth();
  if (userId === null) {
    throw new Error('Unauthorized');
  }

  const lastUserText = extractLastUserText(input.messages);
  if (lastUserText !== null) {
    const { blocked, reason } = await checkGuardrail({
      input: lastUserText,
      taskContext: syllabusTaskDescription,
    });
    if (blocked) {
      return { ok: false, reason };
    }
  }

  await ensureUser(userId);
  const locale = parseLocale(await getLocale());

  const syllabus = syllabusSchema.parse(input.syllabus);

  const { title, memory } = await bootstrapJourney({
    draft: syllabus,
    messages: input.messages,
    locale,
  });

  const journey = await createJourney({
    userId,
    title,
    styleId: input.styleId,
    syllabus,
    memory,
  });

  return {
    ok: true,
    id: journey.id,
    path: journeyPath(journey.id, journey.title),
  };
}
