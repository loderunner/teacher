import { tool } from 'ai';
import { z } from 'zod';

import { updateJourneyMemory } from '@/lib/server/journeys/updateMemory';
import { syllabusSchema } from '@/lib/server/syllabus/schema';

/**
 * Builds an AI SDK tool that lets the model propose a full replacement of the
 * journey's syllabus, surfaced to the learner as a confirmation card.
 *
 * Signal-only: the tool emits a recognisable tool part; the actual apply
 * happens in `applySyllabusChangeAction` when the user clicks Apply.
 *
 * @returns A `proposeSyllabusChange` tool.
 */
export function createProposeSyllabusChangeTool() {
  return tool({
    description: `Propose a replacement for the journey's syllabus. Fire this tool only when there is a concrete pedagogical reason in the current conversation — the learner asked for a deeper dive that warrants its own chapter, or wants to skip a section that turned out to be unnecessary, etc.

Rules:
- Always pass the FULL new syllabus, never a partial delta. The server replaces the syllabus wholesale.
- Each existing chapter in the system prompt's syllabus block is prefixed with its id in brackets, e.g. "1. [abc123def4] Installing Python". For every chapter in your proposal that maps to an existing one (preserved, reordered, or renamed), copy its id into the chapter object's \`id\` field verbatim. For brand-new chapters you are inserting, omit \`id\` entirely.
- Renaming a chapter is expressed by keeping its existing \`id\` and changing its \`title\`. Reordering is expressed by keeping ids the same and changing the array order.
- The server rejects any proposal that drops an id belonging to a \`done\` or \`active\` chapter. Never remove the learner's completed or current chapters.
- Do not propose to change the title of the chapter currently being taught unless the learner asked for it. Renaming the current chapter mid-chapter is disruptive.
- The user must confirm the proposal by clicking Apply. After firing the tool, end your message — do not continue teaching in the same turn. Use this tool sparingly: a proposed change interrupts flow.
- Include a short \`reason\` (one or two sentences in the learner's language) explaining why the change is helpful. The reason is shown to the learner above the diff.`,
    inputSchema: z.object({
      reason: z.string().min(1).max(500),
      newSyllabus: syllabusSchema,
    }),
    execute: async () => ({ ok: true }),
  });
}

/**
 * Builds an AI SDK tool that signals chapter completion. The model emits this
 * once, and the UI surfaces a "Go to next chapter" button. The actual state
 * transition happens in `completeChapterAction` when the user clicks.
 *
 * @returns A signal-only `markChapterComplete` tool.
 */
export function createMarkChapterCompleteTool() {
  return tool({
    description: `Signal that the current chapter is complete and the learner is ready to move on.

Rules:
- Fire this tool exactly once, when the chapter's material is fully covered AND the learner has demonstrated grasp of the key ideas. Do not fire it speculatively.
- After firing this tool, end your message. Do not continue teaching in the same turn.
- Never claim the chapter is complete in prose without also calling this tool — the tool call is the canonical signal the UI listens for to show the "Go to next chapter" button.
- This tool does not move the learner forward by itself. The user clicks a button to confirm.`,
    inputSchema: z.object({}),
    execute: async () => ({ ok: true }),
  });
}

/** Parameters for building the chapter-chat `updateMemory` tool. */
export type CreateUpdateMemoryToolParams = {
  /** Clerk user ID of the owner of the journey. */
  userId: string;
  /** Journey whose memory may be replaced. */
  journeyId: string;
};

/**
 * Builds an AI SDK tool that lets the model replace the learner memory of
 * the current journey. The journey and owner are captured at construction
 * time so the model can only mutate the journey it is currently teaching.
 *
 * @param params - Owner ID and journey ID for the active chat.
 * @returns A request-scoped `updateMemory` tool.
 */
export function createUpdateMemoryTool({
  userId,
  journeyId,
}: CreateUpdateMemoryToolParams) {
  return tool({
    description: `Replace the entire learner memory for this journey with a new Markdown string.

Rules:
- Always pass the FULL updated memory — this is a replacement, not a patch.
- Use the second person ("You want to…", "You already know…").
- Only call this tool when you have learned something durable about the learner: a clarified goal, a confirmed gap, a pace preference, a recurring confusion. Skip ephemeral signals.
- Never mention this tool or the memory update to the learner. The update is silent.`,
    inputSchema: z.object({ memory: z.string().min(1).max(8000) }),
    execute: async ({ memory }) => {
      await updateJourneyMemory({ userId, journeyId, memory });
      return { ok: true };
    },
  });
}
