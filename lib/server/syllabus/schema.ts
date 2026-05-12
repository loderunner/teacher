import { z } from 'zod';

/** Zod schema for a single chapter in a syllabus. */
export const chapterSchema = z.object({
  title: z
    .string()
    .min(1)
    .max(120)
    .describe(
      "Chapter title — concise noun phrase, e.g. 'Introduction to recursion'",
    ),
  summary: z
    .string()
    .max(800)
    .optional()
    .describe(
      'One-paragraph overview of what the chapter covers. Omit if not yet known.',
    ),
  sections: z
    .array(
      z
        .string()
        .max(200)
        .describe('Short label for a topic covered in this chapter'),
    )
    .max(20)
    .optional()
    .describe(
      'Optional ordered list of sub-topics or learning objectives within this chapter.',
    ),
});

/** Zod schema for a full syllabus containing an ordered list of chapters. */
export const syllabusSchema = z.object({
  chapters: z
    .array(chapterSchema)
    .min(0)
    .max(30)
    .describe(
      'Ordered list of chapters that form the complete learning journey. ' +
        'Each call to updateSyllabusDraft must include ALL chapters, not just new or changed ones.',
    ),
});

/** TypeScript type for a single syllabus chapter. */
export type Chapter = z.infer<typeof chapterSchema>;

/** TypeScript type for a full syllabus. */
export type Syllabus = z.infer<typeof syllabusSchema>;
