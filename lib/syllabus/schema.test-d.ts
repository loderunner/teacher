import { expectTypeOf } from 'vitest';

import type {
  Chapter,
  PartialChapter,
  PartialSyllabus,
  Syllabus,
} from './schema';

expectTypeOf<keyof PartialChapter>().toEqualTypeOf<keyof Chapter>();
expectTypeOf<keyof PartialSyllabus>().toEqualTypeOf<keyof Syllabus>();
expectTypeOf<Chapter>().toExtend<PartialChapter>();
expectTypeOf<Syllabus>().toExtend<PartialSyllabus>();
