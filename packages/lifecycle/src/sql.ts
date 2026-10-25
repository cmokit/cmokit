// The SQL interface the lifecycle's Durable Objects are written against (ADR-0006), so their logic
// runs on a Durable Object's SQLite storage and, in tests, on Node's.

export type Row = Record<string, string | number | null>;

export interface Sql {
  /** Runs a statement and returns the rows it yields. */
  all(query: string, ...params: (string | number | null)[]): Row[];
}
