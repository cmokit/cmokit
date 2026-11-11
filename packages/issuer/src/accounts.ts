// The issuer's own records (ADR-0018, ADR-0030), each kept in a Durable Object of its own and written
// against the SQL interface, so the logic runs on Node's SQLite in tests.
//
// A sign-in identity's object is named by a provider and its stable subject id (`google:<sub>`,
// `github:<id>`, `meta:<id>`) or by `email:` and an address. It holds the person it belongs to and,
// for an address, its pending code: hashed, with its expiry and the attempts left, and deleted when
// used, expired or out of attempts. An object named `network:` and an address counts the codes sent
// from that network, and holds nothing else.
//
// A person's object, named by the person's id, holds their sign-in identities, their proven email
// address and the customers they belong to. The customer's own object is the authority on who its
// users are; this list is an index of it, written in the same step (ADR-0030).

import type { Sql } from './sql.ts';

/** How long a code works, how many tries it allows, and how many may be sent. */
export const CODE_LIFETIME = 10 * 60_000;
export const CODE_ATTEMPTS = 5;
/** Codes sent to one address, and from one network, in an hour. */
export const SENDS_PER_ADDRESS = 5;
export const SENDS_PER_NETWORK = 20;
const HOUR = 60 * 60_000;

export type CodeCheck = 'ok' | 'wrong' | 'gone';

async function hash(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function equal(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return difference === 0;
}

export class Identity {
  readonly #sql: Sql;

  constructor(sql: Sql) {
    this.#sql = sql;
    sql.all('CREATE TABLE IF NOT EXISTS identity (one INTEGER PRIMARY KEY CHECK (one = 1), person TEXT NOT NULL)');
    sql.all('CREATE TABLE IF NOT EXISTS code (one INTEGER PRIMARY KEY CHECK (one = 1), hash TEXT NOT NULL, expires_at INTEGER NOT NULL, attempts INTEGER NOT NULL)');
    sql.all('CREATE TABLE IF NOT EXISTS sends (at INTEGER NOT NULL)');
  }

  /** The person this identity belongs to, if it has signed in before. */
  async person(): Promise<string | null> {
    return (this.#sql.all('SELECT person FROM identity')[0]?.person as string | undefined) ?? null;
  }

  /** Makes the identity the given person's unless it already belongs to someone, and returns its person. */
  async claim(person: string): Promise<string> {
    this.#sql.all('INSERT OR IGNORE INTO identity (one, person) VALUES (1, ?)', person);
    return (await this.person())!;
  }

  /** Counts a send against a limit per hour. False, and nothing counted, when the limit is reached. */
  async allow(limit: number, now: number): Promise<boolean> {
    this.#sql.all('DELETE FROM sends WHERE at <= ?', now - HOUR);
    const [{ n }] = this.#sql.all('SELECT count(*) AS n FROM sends');
    if (Number(n) >= limit) return false;
    this.#sql.all('INSERT INTO sends (at) VALUES (?)', now);
    return true;
  }

  /** A new six-digit code for this address, replacing any pending one, or undefined when too many were sent. */
  async issueCode(now: number): Promise<string | undefined> {
    if (!(await this.allow(SENDS_PER_ADDRESS, now))) return undefined;
    let draw: number;
    do draw = crypto.getRandomValues(new Uint32Array(1))[0]; while (draw >= 4_294_000_000);
    const code = String(draw % 1_000_000).padStart(6, '0');
    this.#sql.all('INSERT OR REPLACE INTO code (one, hash, expires_at, attempts) VALUES (1, ?, ?, ?)', await hash(code), now + CODE_LIFETIME, CODE_ATTEMPTS);
    return code;
  }

  /** Checks a code. A right one is used up; a wrong one costs an attempt; none is left once expired or out of attempts. */
  async checkCode(code: string, now: number): Promise<CodeCheck> {
    const [pending] = this.#sql.all('SELECT hash, expires_at, attempts FROM code');
    if (!pending) return 'gone';
    if (Number(pending.expires_at) <= now) {
      this.#sql.all('DELETE FROM code');
      return 'gone';
    }
    if (equal(await hash(code.trim()), String(pending.hash))) {
      this.#sql.all('DELETE FROM code');
      return 'ok';
    }
    const left = Number(pending.attempts) - 1;
    if (left <= 0) {
      this.#sql.all('DELETE FROM code');
      return 'gone';
    }
    this.#sql.all('UPDATE code SET attempts = ?', left);
    return 'wrong';
  }
}

/** A customer a person is a user of: its slug, and the name the person gave it, if any. */
export interface Brand {
  slug: string;
  name: string | null;
}

export class Person {
  readonly #sql: Sql;

  constructor(sql: Sql) {
    this.#sql = sql;
    sql.all('CREATE TABLE IF NOT EXISTS identities (name TEXT PRIMARY KEY, added_at INTEGER NOT NULL)');
    sql.all('CREATE TABLE IF NOT EXISTS email (one INTEGER PRIMARY KEY CHECK (one = 1), address TEXT NOT NULL)');
    sql.all('CREATE TABLE IF NOT EXISTS customers (slug TEXT PRIMARY KEY, added_at INTEGER NOT NULL, name TEXT)');
    // Records made before brands had names have no name column.
    try {
      sql.all('ALTER TABLE customers ADD COLUMN name TEXT');
    } catch {
      // The column is there already.
    }
  }

  /** Records a sign-in identity of this person's, and the email address it proved, if any. */
  async addIdentity(name: string, email: string | null, now: number): Promise<void> {
    this.#sql.all('INSERT OR IGNORE INTO identities (name, added_at) VALUES (?, ?)', name, now);
    if (email) this.#sql.all('INSERT OR IGNORE INTO email (one, address) VALUES (1, ?)', email);
  }

  async identities(): Promise<string[]> {
    return this.#sql.all('SELECT name FROM identities ORDER BY added_at, name').map((r) => String(r.name));
  }

  async email(): Promise<string | null> {
    return (this.#sql.all('SELECT address FROM email')[0]?.address as string | undefined) ?? null;
  }

  /** The customers this person is a user of, by slug. */
  async customers(): Promise<string[]> {
    return this.#sql.all('SELECT slug FROM customers ORDER BY added_at, slug').map((r) => String(r.slug));
  }

  /** The customers this person is a user of, each with the name the person gave it, if any. */
  async brands(): Promise<Brand[]> {
    return this.#sql.all('SELECT slug, name FROM customers ORDER BY added_at, slug')
      .map((r) => ({ slug: String(r.slug), name: r.name === null || r.name === undefined ? null : String(r.name) }));
  }

  /**
   * Indexes a customer this person was made a user of, in the step that made them one (ADR-0017),
   * with the name they gave it, if any.
   */
  async addCustomer(slug: string, now: number, name?: string): Promise<void> {
    this.#sql.all('INSERT OR IGNORE INTO customers (slug, added_at, name) VALUES (?, ?, ?)', slug, now, name ?? null);
  }

  /** Names, or renames, one of this person's customers; false when it is not one of theirs. */
  async nameCustomer(slug: string, name: string): Promise<boolean> {
    return this.#sql.all('UPDATE customers SET name = ? WHERE slug = ? RETURNING slug', name, slug).length > 0;
  }
}
