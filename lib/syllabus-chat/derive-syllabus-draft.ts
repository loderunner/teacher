import { type DeepPartial, type UIMessage } from 'ai';

import { type Syllabus, syllabusSchema } from '@/lib/server/syllabus/schema';

function readDraft(input: unknown): unknown {
  if (input === null || typeof input !== 'object' || !('draft' in input)) {
    return undefined;
  }
  return input.draft;
}

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

  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role !== 'assistant') {
      continue;
    }
    for (let j = msg.parts.length - 1; j >= 0; j--) {
      const part = msg.parts[j];
      if (part.type !== 'tool-updateSyllabusDraft') {
        continue;
      }

      const rawDraft = readDraft(part.input);

      if (!partialSeen) {
        const parsed = syllabusSchema.partial().safeParse(rawDraft);
        partialDraft = parsed.success ? parsed.data : null;
        partialSeen = true;
      }

      const full = syllabusSchema.safeParse(rawDraft);
      if (full.success) {
        draft = full.data;
        return { draft, partialDraft };
      }
    }
  }

  return { draft, partialDraft };
}
