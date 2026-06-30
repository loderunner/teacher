import { z } from 'zod';

/** Zod schema for a single chapter in a syllabus. */
export const chapterSchema = z.object({
  id: z
    .string()
    .optional()
    .describe(
      'Existing chapter ID. Present when this chapter maps to a row in the database (preserve, rename, or reorder). Omit for brand-new chapters.',
    ),
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
    .describe('One-paragraph overview of what the chapter covers.'),
  sections: z
    .array(
      z
        .string()
        .max(200)
        .describe('Short label for a topic covered in this chapter'),
    )
    .min(1)
    .max(20)
    .describe(
      'Ordered list of sub-topics or learning objectives within this chapter.',
    ),
});

/** Zod schema for a full syllabus containing an ordered list of chapters. */
export const syllabusSchema = z.object({
  chapters: z
    .array(chapterSchema)
    .min(1)
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

/**
 * Permissive chapter schema for in-progress tool inputs. Unlike
 * {@link chapterSchema.partial}, omits `min(1)` on `title` and `sections` so
 * mid-stream payloads (empty arrays, blank titles) still parse.
 *
 * Keep field keys and max bounds aligned with {@link chapterSchema}; type
 * parity is checked in `schema.test-d.ts` (via `pnpm test`) and runtime parity
 * tests in `schema.test.ts`.
 */
export const partialChapterSchema = z.object({
  id: z.string().optional(),
  title: z.string().max(120).optional(),
  summary: z.string().max(800).optional(),
  sections: z.array(z.string().max(200)).max(20).optional(),
});

/** TypeScript type for a partial syllabus chapter. */
export type PartialChapter = z.infer<typeof partialChapterSchema>;

/**
 * Permissive syllabus schema for in-progress tool inputs (streaming sidebar
 * preview). Unlike {@link syllabusSchema}, allows an empty or omitted
 * `chapters` array and incomplete chapter objects.
 */
export const partialSyllabusSchema = z.object({
  chapters: z.array(partialChapterSchema).max(30).optional(),
});

/** TypeScript type for a partial syllabus. */
export type PartialSyllabus = z.infer<typeof partialSyllabusSchema>;
