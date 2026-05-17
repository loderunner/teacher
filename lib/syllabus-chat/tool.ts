import { tool } from 'ai';
import { z } from 'zod';

import { updateDraftSyllabus } from '@/lib/server/journeys/update-draft';
import { syllabusSchema } from '@/lib/server/syllabus/schema';

/** Parameters for {@link createUpdateSyllabusDraftTool}. */
export type CreateUpdateSyllabusDraftToolParams = {
  /** Draft journey whose `syllabus` column should be updated. */
  journeyId: string;
};

/**
 * Builds the `updateSyllabusDraft` tool for a specific draft journey so tool
 * execution persists the latest outline to the database.
 *
 * @param params - Journey id to bind into the tool closure.
 */
export function createUpdateSyllabusDraftTool({
  journeyId,
}: CreateUpdateSyllabusDraftToolParams) {
  return tool({
    description: `Replace the entire syllabus draft with the new version.

Rules:
- Always pass ALL chapters, even ones that have not changed — this is a full replace, not a patch.
- Call this tool immediately whenever the outline changes; do not narrate changes in prose instead.
- Use concise chapter titles (noun phrases, ≤ 120 chars). Add a short summary only when it adds clarity.
- Order chapters from foundational to advanced.`,
    inputSchema: z.object({ draft: syllabusSchema }),
    execute: async ({ draft }) => {
      await updateDraftSyllabus({ journeyId, syllabus: draft });
      return { ok: true };
    },
  });
}
