import { type DeepPartial, type UIMessage } from 'ai';

import { type Syllabus, syllabusSchema } from '@/lib/server/syllabus/schema';

/**
 * Derives the latest complete syllabus and the latest partial draft from
 * `updateSyllabusDraft` tool parts in UI messages.
 *
 * `draft` is the most recent tool input that fully validates against
 * `syllabusSchema` and gates activation. `partialDraft` reflects the very
 * latest tool input — possibly mid-stream — relaxed against
 * `syllabusSchema.partial()` and drives the sidebar preview.
 *
 * @param messages - Chat messages (newest assistant tool parts win).
 */
export function deriveSyllabusDraftsFromMessages(messages: UIMessage[]): {
  draft: Syllabus | null;
  partialDraft: DeepPartial<Syllabus> | null;
} {
  let draft: Syllabus | null = null;
  let partialDraft: DeepPartial<Syllabus> | null = null;
  let partialSeen = false;

  // Iterate backwards through the messages to find the most recent draft.
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role !== 'assistant') {
      continue;
    }
    // Iterate backwards through the tool parts to find the most recent draft.
    for (let j = msg.parts.length - 1; j >= 0; j--) {
      const part = msg.parts[j];
      if (part.type !== 'tool-updateSyllabusDraft') {
        continue;
      }

      if (
        !part.input ||
        typeof part.input !== 'object' ||
        !('draft' in part.input)
      ) {
        continue;
      }
      const rawDraft = (part.input).draft;

      // If we haven't seen a partial draft yet, try to parse the raw draft as a
      // partial draft.
      if (!partialSeen) {
        const parsed = syllabusSchema.partial().safeParse(rawDraft);
        partialDraft = parsed.success ? parsed.data : null;
        partialSeen = true;
      }

      // Try to parse the raw draft as a full draft.
      const full = syllabusSchema.safeParse(rawDraft);
      if (full.success) {
        draft = full.data;
        return { draft, partialDraft };
      }
    }
  }

  return { draft, partialDraft };
}
