// A site's waitlist (ADR-0014), as one Durable Object holds it: who joined, when, through whose
// referral link, and whether a maintainer has activated them. Joining gives no access; activation
// sends the site's activation message, and a product asks whether an address is activated. Written
// against the SQL interface, so it runs on the Durable Object's storage and on Node's SQLite alike.
// Joining and activating twice act once.

import { referralCode } from '@cmokit/cli';
import type { Sql } from './sql.ts';

/** What a person joins the waitlist with. */
export interface Joining {
  /** Their lead key, from their address. */
  key: string;
  email: string;
  visitor: string;
  /** The site's origin, where their unsubscribe link points. */
  origin: string;
  /** The referral code they arrived with, if any. */
  referredBy?: string;
}

/** One person on the waitlist, as a maintainer reads it. */
export interface Waitlisted {
  email: string;
  joined: string;
  /** Their own referral code. */
  code: string;
  /** The code of whoever referred them, if anyone did. */
  referredBy: string | null;
  /** How many people joined through their referral link. */
  referrals: number;
  activated: string | null;
}

/** Someone just activated, whom the activation message goes to. */
export interface Activated {
  key: string;
  email: string;
  visitor: string;
  origin: string;
  token: string;
}

export class Waitlist {
  readonly #sql: Sql;
  readonly #newToken: () => string;

  constructor(sql: Sql, newToken: () => string = () => crypto.randomUUID()) {
    this.#sql = sql;
    this.#newToken = newToken;
    sql.all(`CREATE TABLE IF NOT EXISTS waitlist (
      key TEXT PRIMARY KEY, email TEXT NOT NULL, visitor TEXT NOT NULL, origin TEXT NOT NULL, code TEXT NOT NULL,
      referred_by TEXT, joined_at INTEGER NOT NULL, activated_at INTEGER, token TEXT NOT NULL, unsubscribed INTEGER NOT NULL)`);
  }

  /** Puts the person on the list, once; a person cannot refer themselves. */
  async join(joining: Joining, now: number): Promise<void> {
    const code = await referralCode(joining.key);
    const referredBy = joining.referredBy && joining.referredBy !== code ? joining.referredBy : null;
    this.#sql.all(
      'INSERT OR IGNORE INTO waitlist VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, 0)',
      joining.key, joining.email.trim(), joining.visitor, joining.origin, code, referredBy, now, this.#newToken(),
    );
  }

  /** Everyone on the list, those who referred the most people first, then the earliest to join. */
  list(): Waitlisted[] {
    return this.#sql.all(`SELECT w.*, (SELECT COUNT(*) FROM waitlist r WHERE r.referred_by = w.code) AS referrals
      FROM waitlist w ORDER BY referrals DESC, joined_at ASC`).map((row) => ({
      email: row.email as string,
      joined: new Date(row.joined_at as number).toISOString(),
      code: row.code as string,
      referredBy: row.referred_by as string | null,
      referrals: Number(row.referrals),
      activated: row.activated_at === null ? null : new Date(row.activated_at as number).toISOString(),
    }));
  }

  /**
   * Activates the person with this address. Returns them when this call activated them, so the
   * activation message is sent once; undefined when they are not on the list or were already active.
   */
  activate(email: string, now: number): Activated | undefined {
    const row = this.#find(email);
    if (!row || row.activated_at !== null) return undefined;
    this.#sql.all('UPDATE waitlist SET activated_at = ? WHERE key = ?', now, row.key);
    if (row.unsubscribed) return undefined;
    return { key: row.key as string, email: row.email as string, visitor: row.visitor as string, origin: row.origin as string, token: row.token as string };
  }

  has(email: string): boolean {
    return this.#find(email) !== undefined;
  }

  isActivated(email: string): boolean {
    const row = this.#find(email);
    return row !== undefined && row.activated_at !== null;
  }

  /** Stops messages to the person when `token` is theirs, and returns their address; undefined otherwise. */
  unsubscribe(key: string, token: string): string | undefined {
    const row = this.#sql.all('SELECT email, token FROM waitlist WHERE key = ?', key)[0];
    if (!row || row.token !== token) return undefined;
    this.#sql.all('UPDATE waitlist SET unsubscribed = 1 WHERE key = ?', key);
    return row.email as string;
  }

  #find(email: string) {
    return this.#sql.all('SELECT * FROM waitlist WHERE lower(email) = lower(?)', email.trim())[0];
  }
}
