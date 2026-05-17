import { type DeepPartial, type UIMessage } from 'ai';

import { type Syllabus, syllabusSchema } from '@/lib/server/syllabus/schema';

function readDraftFromToolInput(input: unknown): unknown {
  if (typeof input !== 'object' || input === null) {
    return undefined;
  }
  if (!('draft' in input)) {
    return undefined;
  }
  return Reflect.get(input, 'draft');
}

/**
 * Derives the latest complete syllabus and the latest partial draft from
 * persisted or live `updateSyllabusDraft` tool parts in UI messages.
 *
 * @param messages - Chat messages (newest assistant tool parts win).
 * @returns `draft` is the latest fully validated outline when available, and
 *   `partialDraft` includes in-progress streaming input when present.
 */
export function deriveSyllabusDraftsFromMessages(messages: UIMessage[]): {
  draft: Syllabus | null;
  partialDraft: DeepPartial<Syllabus> | null;
} {
  let draft: Syllabus | null = null;
  let partialDraft: DeepPartial<Syllabus> | null = null;
  let partialResolved = false;

  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role !== 'assistant') {
      continue;
    }
    const { parts } = msg;
    for (let j = parts.length - 1; j >= 0; j--) {
      const part = parts[j];
      if (part.type !== 'tool-updateSyllabusDraft') {
        continue;
      }

      const rawDraft = readDraftFromToolInput(part.input);

      if (!partialResolved) {
        if (
          part.state === 'output-available' ||
          part.state === 'input-available'
        ) {
          const parsed = syllabusSchema.safeParse(rawDraft);
          partialDraft = parsed.success ? parsed.data : null;
          partialResolved = true;
        } else if (part.state === 'input-streaming') {
          const partialParsed = syllabusSchema.partial().safeParse(rawDraft);
          partialDraft = partialParsed.success ? partialParsed.data : null;
          partialResolved = true;
        }
      }

      if (
        draft === null &&
        (part.state === 'output-available' || part.state === 'input-available')
      ) {
        const parsed = syllabusSchema.safeParse(rawDraft);
        if (parsed.success) {
          draft = parsed.data;
        }
      }

      if (partialResolved && draft !== null) {
        return { draft, partialDraft };
      }
    }
  }

  return { draft, partialDraft };
}
