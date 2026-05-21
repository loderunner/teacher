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

/** Database table for registered users, keyed by their Clerk user ID. */
export const users = pgTable('users', {
  id: text('id').primaryKey(), // Clerk userId
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

/** Database table for learning journeys owned by a user. */
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
    memory: jsonb('memory').$type<string[]>().notNull().default([]),
    currentChapterIndex: integer('current_chapter_index').notNull().default(0),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at')
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  },
  (t) => [index('journeys_user_idx').on(t.userId)],
);

/** Postgres enum for the progression state of a chapter. */
export const chapterStatusEnum = pgEnum('chapter_status', [
  'locked',
  'active',
  'done',
]);

/** Database table for individual chapters within a journey. */
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
