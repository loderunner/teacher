import { tool } from 'ai';
import { z } from 'zod';

import { syllabusSchema } from '@/lib/server/syllabus/schema';

export const updateSyllabusDraft = tool({
  description: `Replace the entire syllabus draft with the new version.

Rules:
- Always pass ALL chapters, even ones that have not changed — this is a full replace, not a patch.
- Call this tool immediately whenever the outline changes; do not narrate changes in prose instead.
- Use concise chapter titles (noun phrases, ≤ 120 chars). Add a short summary only when it adds clarity.
- Order chapters from foundational to advanced.`,
  inputSchema: z.object({ fullDraft: syllabusSchema }),
  execute: async () => ({ ok: true }),
});
