import {
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { nanoid } from 'nanoid';

export const users = pgTable('users', {
  id: text('id').primaryKey(), // Clerk userId
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const journeys = pgTable(
  'journeys',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => nanoid(10)),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    styleId: text('style_id').notNull(),
    syllabus: jsonb('syllabus').notNull(),
    memory: text('memory').notNull().default(''),
    currentChapterIndex: integer('current_chapter_index').notNull().default(0),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at')
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  },
  (t) => [index('journeys_user_idx').on(t.userId)],
);

export const chapterStatusEnum = pgEnum('chapter_status', [
  'locked',
  'active',
  'done',
]);

export const chapters = pgTable(
  'chapters',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => nanoid(10)),
    journeyId: text('journey_id')
      .notNull()
      .references(() => journeys.id, { onDelete: 'cascade' }),
    idx: integer('idx').notNull(), // 0-based
    title: text('title').notNull(),
    status: chapterStatusEnum('status').notNull().default('locked'),
    summary: text('summary'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('chapters_journey_idx_unique').on(t.journeyId, t.idx),
    index('chapters_journey_idx').on(t.journeyId),
  ],
);
