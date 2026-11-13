// Where a brand's visit counts are kept (ADR-0050): how many times a page on one of its sites was
// opened, per day, page and source, and nothing about who opened it. The funnel reads them beside the
// waitlist. The store is an interface so the counts can move to an analytics store later by adding
// an adapter; its first adapter keeps them in the brand's own records (ADR-0030).

import type { Sql } from './sql.ts';

/** One page opened: the day, as YYYY-MM-DD in UTC, the page without its query, and its tracking tags. */
export interface Visit {
  day: string;
  page: string;
  source: Record<string, string>;
}

/** The visits counted for one page and source over a period. */
export interface VisitCount {
  page: string;
  source: Record<string, string>;
  visits: number;
}

export interface VisitStore {
  add(visit: Visit): Promise<void>;
  /** The counts for each page and source from the first day to the last, both included. */
  counts(from: string, to: string): Promise<VisitCount[]>;
  /** The first day with a count, or null before any visit was counted. */
  since(): Promise<string | null>;
}

/** The tracking tags as one key, in name order, so the same tags always meet. */
export function sourceKey(source: Record<string, string>): string {
  return JSON.stringify(Object.fromEntries(Object.entries(source).sort(([a], [b]) => a.localeCompare(b))));
}

/** The first adapter: the counts in the brand's own SQLite records, one row per day, page and source. */
export function recordVisits(sql: Sql): VisitStore {
  sql.all(`CREATE TABLE IF NOT EXISTS visits (day TEXT NOT NULL, page TEXT NOT NULL, source TEXT NOT NULL,
    count INTEGER NOT NULL, PRIMARY KEY (day, page, source))`);
  return {
    async add({ day, page, source }) {
      sql.all(`INSERT INTO visits (day, page, source, count) VALUES (?, ?, ?, 1)
        ON CONFLICT (day, page, source) DO UPDATE SET count = count + 1`, day, page, sourceKey(source));
    },
    async counts(from, to) {
      return sql.all('SELECT page, source, SUM(count) AS visits FROM visits WHERE day >= ? AND day <= ? GROUP BY page, source', from, to)
        .map((row) => ({ page: row.page as string, source: JSON.parse(row.source as string) as Record<string, string>, visits: Number(row.visits) }));
    },
    async since() {
      return (sql.all('SELECT MIN(day) AS day FROM visits')[0]?.day as string | null | undefined) ?? null;
    },
  };
}
