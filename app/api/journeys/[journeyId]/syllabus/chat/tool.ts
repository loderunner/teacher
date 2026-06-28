import { tool } from 'ai';

import { updateSyllabusDraft } from '@/lib/journeys/updateSyllabusDraft';
import { syllabusSchema } from '@/lib/syllabus/schema';

/** Parameters for building the syllabus-chat `updateSyllabusDraft` tool. */
export type CreateUpdateSyllabusDraftToolParams = {
  /** Clerk user ID of the owner of the journey. */
  userId: string;
  /** Journey whose syllabus draft is being updated. */
  journeyId: string;
};

/**
 * Builds an AI SDK tool that lets the model publish a new syllabus draft. Each
 * call persists the full replacement syllabus to the database so the column
 * stays current throughout the drafting conversation.
 *
 * The full tool input is also mirrored back to the UI via the streamed tool
 * part, so the sidebar updates in real-time as the model streams the draft.
 *
 * @param params - Owner ID and journey ID for the active chat.
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
- Order chapters from foundational to advanced.
- Each chapter's \`sections\` is an array of plain strings (section title labels), not objects. Must have at least one entry.

Example input:
{
  "chapters": [
    {
      "title": "Introduction to the Roman Empire",
      "summary": "Geographic and political foundations of Rome's rise.",
      "sections": ["Geography and early settlements", "The founding myths"]
    },
    {
      "title": "The Republic",
      "sections": ["Senate and governance", "Conflict with Carthage"]
    }
  ]
}`,
    inputSchema: syllabusSchema,
    execute: async (syllabus) => {
      await updateSyllabusDraft({ userId, journeyId, syllabus });
      return 'Updated syllabus draft';
    },
  });
}
