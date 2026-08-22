import { chainMocked } from 'chain-mock';
import type { SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { listJourneys } from './list';

import { db } from '@/lib/db';

vi.mock('@/lib/db');

const mockDb = chainMocked(db);

const updatedAt = new Date('2026-01-01T00:00:00Z');

/** Renders an `SQL` fragment to text, collapsing whitespace for assertions. */
const renderSQL = (fragment: SQL<unknown>): string =>
  new PgDialect().sqlToQuery(fragment).sql.replace(/\s+/g, ' ').trim();

/**
 * Renders the `chapterCount` expression from the main select projection
 * (the second `db.select` call — the first builds the correlated chapter
 * count subquery).
 */
const chapterCountSQL = (): string => {
  const [projection] = mockDb.select.mock.calls[1] as [
    Record<string, SQL<unknown>>,
  ];
  return renderSQL(projection.chapterCount);
};

/**
 * Renders the correlation condition passed to the chapter count subquery's
 * `.where()` call (the first `db.select().from().where()` invocation).
 */
const chapterCountCorrelationSQL = (): string =>
  renderSQL(mockDb.select.from.where.mock.calls[0][0] as SQL<unknown>);

const fixture = (id: string, title: string) => ({
  id,
  title,
  styleId: 'teacher',
  status: 'active' as const,
  chapterCount: 3,
  updatedAt,
});

describe('listJourneys', () => {
  beforeEach(() => {
    mockDb.mockReset();
  });

  it('returns summaries for the given user', async () => {
    mockDb.select.from.where.orderBy.limit.mockResolvedValueOnce([
      fixture('j1', 'Rust basics'),
      fixture('j2', 'TypeScript'),
    ]);

    const result = await listJourneys({ userId: 'user-1', limit: 10 });

    expect(result).toEqual([
      fixture('j1', 'Rust basics'),
      fixture('j2', 'TypeScript'),
    ]);
  });

  it('returns an empty array when the user has no journeys', async () => {
    mockDb.select.from.where.orderBy.limit.mockResolvedValueOnce([]);

    const result = await listJourneys({ userId: 'user-1', limit: 10 });

    expect(result).toEqual([]);
  });

  describe('chapterCount', () => {
    it('counts chapter rows for active journeys', async () => {
      mockDb.select.from.where.orderBy.limit.mockResolvedValueOnce([]);

      await listJourneys({ userId: 'user-1', limit: 10 });

      expect(chapterCountSQL()).toContain(
        `CASE WHEN "journeys"."status" = 'active'`,
      );
      // The correlation must be built through the query builder (not a raw
      // `sql` fragment), or the subquery's own "id" column shadows the
      // outer journey's "id" once inlined into the compiled query — see the
      // comment in list.ts.
      expect(chapterCountCorrelationSQL()).toBe(
        `"chapters"."journey_id" = "journeys"."id"`,
      );
    });

    it('falls back to the draft syllabus for drafting journeys', async () => {
      // Drafting journeys have no chapter rows yet, so the count can only
      // come from the frozen-at-activation draft blob.
      mockDb.select.from.where.orderBy.limit.mockResolvedValueOnce([]);

      await listJourneys({ userId: 'user-1', limit: 10 });

      expect(chapterCountSQL()).toContain(
        `ELSE COALESCE(jsonb_array_length("journeys"."syllabus_draft"->'chapters'), 0)`,
      );
    });
  });

  it('applies the pagination cursor when provided', async () => {
    mockDb.select.from.where.orderBy.limit.mockResolvedValueOnce([
      fixture('j2', 'TypeScript'),
    ]);

    const result = await listJourneys({
      userId: 'user-1',
      limit: 10,
      updatedAt: new Date('2026-06-01T00:00:00Z'),
      id: 'abc1234567',
    });

    expect(result).toEqual([fixture('j2', 'TypeScript')]);
  });
});
