import { tool } from 'ai';

import { updateJourneySyllabus } from '@/lib/server/journeys/updateSyllabus';
import { syllabusSchema } from '@/lib/server/syllabus/schema';

/** Parameters for building the syllabus-draft persistence tool. */
export type CreateUpdateSyllabusDraftToolParams = {
  /** Clerk user ID — scopes the write to the owner of the journey. */
  userId: string;
  /** Journey whose syllabus draft is being updated. */
  journeyId: string;
};

/**
 * Builds an AI SDK tool that persists each syllabus draft to the database.
 * The tool is request-scoped: owner and journey are captured at construction
 * time so the model can only mutate the journey it is currently building.
 *
 * @param params - Owner ID and journey ID for the active drafting session.
 * @returns A request-scoped `updateSyllabusDraft` tool.
 */
export function createUpdateSyllabusDraftTool({
  userId,
  journeyId,
}: CreateUpdateSyllabusDraftToolParams) {
  return tool({
    description: `Replace the entire syllabus draft with the new version.

Rules:
- Always pass ALL chapters, even ones that have not changed — this is a full replace, not a patch.
- Call this tool immediately whenever the outline changes; do not narrate changes in prose instead.
- Use concise chapter titles (noun phrases, ≤ 120 chars). Add a short summary only when it adds clarity.
- Order chapters from foundational to advanced.`,
    inputSchema: syllabusSchema,
    execute: async (syllabus) => {
      await updateJourneySyllabus({ userId, journeyId, syllabus });
      return { ok: true };
    },
  });
}
