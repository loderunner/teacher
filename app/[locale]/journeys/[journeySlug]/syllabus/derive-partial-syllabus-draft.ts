import { type UIMessage } from 'ai';

import {
  type PartialSyllabus,
  partialSyllabusSchema,
} from '@/lib/syllabus/schema';

/**
 * Reads the syllabus draft out of the most recent `updateSyllabusDraft` tool
 * part on the last assistant message, if any. Returns the parsed draft for
 * any tool state where `input` is populated (all states except
 * `output-error` with no input) so the sidebar preview stays visible through
 * tool completion and any trailing assistant prose, rather than blinking
 * empty between `input-streaming` and the end of the turn.
 */
export function derivePartialSyllabusDraft(
  messages: UIMessage[],
): PartialSyllabus | null {
  const last = messages.at(-1);
  if (last?.role !== 'assistant') {
    return null;
  }
  for (let j = last.parts.length - 1; j >= 0; j--) {
    const part = last.parts[j];
    if (part.type !== 'tool-updateSyllabusDraft') {
      continue;
    }
    if (part.input === undefined) {
      return null;
    }
    const parsed = partialSyllabusSchema.safeParse(part.input);
    if (!parsed.success) {
      return null;
    }
    return parsed.data;
  }
  return null;
}
