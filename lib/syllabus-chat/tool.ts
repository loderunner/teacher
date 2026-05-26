import { tool } from 'ai';

import { syllabusSchema } from '@/lib/server/syllabus/schema';

/**
 * Tool the model uses to publish a new syllabus draft. The full input is
 * mirrored back to the UI via the streamed tool part — derivation of the
 * latest draft happens client-side from message history, so no server-side
 * side-effect is needed here.
 */
export const updateSyllabusDraftTool = tool({
  description: `Replace the entire syllabus draft with the new version.

Rules:
- Always pass ALL chapters, even ones that have not changed — this is a full replace, not a patch.
- Call this tool immediately whenever the outline changes; do not narrate changes in prose instead.
- Use concise chapter titles (noun phrases, ≤ 120 chars). Add a short summary only when it adds clarity.
- Order chapters from foundational to advanced.`,
  inputSchema: syllabusSchema,
  execute: async () => 'ok',
});
