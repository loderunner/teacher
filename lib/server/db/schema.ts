import type { UIMessage } from 'ai';
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

import type { Syllabus } from '@/lib/server/syllabus/schema';

/** Database table for registered users, keyed by their Clerk user ID. */
export const users = pgTable('users', {
  id: text('id').primaryKey(), // Clerk userId
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

/** Lifecycle state of a journey row (draft syllabus vs active learning path). */
export const journeyStatusEnum = pgEnum('journey_status', [
  'drafting',
  'active',
]);

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
    syllabus: jsonb('syllabus').$type<Syllabus>().notNull(),
    memory: jsonb('memory').$type<string[]>().notNull().default([]),
    status: journeyStatusEnum('status').notNull().default('active'),
    currentChapterIndex: integer('current_chapter_index').notNull().default(0),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at')
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  },
  (t) => [index('journeys_user_updated_idx').on(t.userId, t.updatedAt, t.id)],
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

/** Persisted UI chat messages scoped to a journey (and optionally a chapter). */
export const messages = pgTable(
  'messages',
  {
    id: text('id').primaryKey(),
    journeyId: text('journey_id')
      .notNull()
      .references(() => journeys.id, { onDelete: 'cascade' }),
    chapterId: text('chapter_id').references(() => chapters.id, {
      onDelete: 'cascade',
    }),
    role: text('role').notNull(),
    parts: jsonb('parts').$type<UIMessage['parts']>().notNull(),
    metadata: jsonb('metadata').$type<UIMessage['metadata']>(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [index('messages_journey_chapter_idx').on(t.journeyId, t.chapterId)],
);
