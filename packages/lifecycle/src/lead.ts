// One lead in one sequence (ADR-0014), as a Durable Object holds it: who the lead is, which message
// is next and when, and whether the sequence has ended. Written against the SQL interface, so it runs
// on the Durable Object's storage and on Node's SQLite alike. Every change sets a state, so an event
// delivered twice acts once.

import { LEADS_PATH, type Resolved } from '@cmokit/cli';
import { render } from './render.ts';
import type { Sql } from './sql.ts';
import type { Analytics, Messaging } from './index.ts';

/** What a lead is captured with. */
export interface Capture {
  /** The lead's key, from its address. */
  key: string;
  email: string;
  /** The visitor's analytics id. */
  visitor: string;
  sequence: string;
  /** The site's origin, such as https://example.com, where the lead's unsubscribe link points. */
  origin: string;
  /** The visitor's variants and channel when captured, carried on every analytics event. */
  properties?: Record<string, unknown>;
}

export interface LeadDeps {
  config: Resolved;
  /** Each message template's text, by name. */
  templates: Record<string, string>;
  messaging: Messaging;
  analytics: Analytics;
  newToken?(): string;
}

type State = 'active' | 'done' | 'stopped';

interface Held {
  key: string;
  email: string | null;
  visitor: string;
  sequence: string;
  origin: string;
  token: string;
  step: number;
  next_at: number | null;
  attempts: number;
  state: State;
  reason: string | null;
  properties: string;
}

/** How long a failed send waits before it is tried again, and how many tries a message gets. */
const RETRY_MS = 3_600_000;
const TRIES = 5;

export class Lead {
  readonly #sql: Sql;
  readonly #deps: LeadDeps;

  constructor(sql: Sql, deps: LeadDeps) {
    this.#sql = sql;
    this.#deps = deps;
    sql.all(`CREATE TABLE IF NOT EXISTS lead (
      key TEXT PRIMARY KEY, email TEXT, visitor TEXT NOT NULL, sequence TEXT NOT NULL, origin TEXT NOT NULL,
      token TEXT NOT NULL, step INTEGER NOT NULL, next_at INTEGER, attempts INTEGER NOT NULL,
      state TEXT NOT NULL, reason TEXT, properties TEXT NOT NULL)`);
    sql.all('CREATE TABLE IF NOT EXISTS seen (id TEXT PRIMARY KEY)');
  }

  held(): Held | undefined {
    return this.#sql.all('SELECT * FROM lead')[0] as unknown as Held | undefined;
  }

  /** Captures the lead, once. Returns when the next message is due, if one is. */
  async start(capture: Capture, now: number): Promise<number | null> {
    const held = this.held();
    if (held) return held.state === 'active' ? held.next_at : null;
    const sequence = this.#sequence(capture.sequence);
    if (!sequence) return null;
    const next = now + sequence.messages[0].afterMs;
    const token = (this.#deps.newToken ?? (() => crypto.randomUUID()))();
    this.#sql.all(
      'INSERT INTO lead VALUES (?, ?, ?, ?, ?, ?, 0, ?, 0, \'active\', NULL, ?)',
      capture.key, capture.email, capture.visitor, capture.sequence, capture.origin, token, next,
      JSON.stringify(capture.properties ?? {}),
    );
    await this.#capture(this.held()!, 'sequence_started', {});
    return next;
  }

  /** Sends the message that is due, if one is. Returns when the next one is due. */
  async wake(now: number): Promise<number | null> {
    const held = this.held();
    if (!held || held.state !== 'active' || held.next_at === null) return null;
    if (held.next_at > now) return held.next_at;
    const sequence = this.#sequence(held.sequence);
    const message = sequence?.messages[held.step];
    if (!sequence || !message || !held.email) {
      await this.stop('sequence changed', undefined);
      return null;
    }
    const following = sequence.messages[held.step + 1];
    const next = following ? now + following.afterMs : null;
    // The step is taken before the message is sent, so a message is sent at most once.
    this.#sql.all(
      'UPDATE lead SET step = ?, next_at = ?, attempts = 0, state = ? WHERE key = ?',
      held.step + 1, next, following ? 'active' : 'done', held.key,
    );
    const { config, templates } = this.#deps;
    const messaging = config.messaging!;
    const unsubscribeUrl = `${held.origin}${LEADS_PATH}/unsubscribe?s=${encodeURIComponent(held.sequence)}`
      + `&l=${held.key}&t=${held.token}`;
    try {
      const content = render(templates[message.template], {
        site: new URL(held.origin).host, unsubscribeUrl, address: messaging.address,
      });
      await this.#deps.messaging.send({
        to: held.email,
        from: messaging.from,
        fromName: messaging.fromName,
        ...content,
        unsubscribeUrl,
        group: messaging.unsubscribeGroup,
        tags: { cmokit_lead: held.key, cmokit_visitor: held.visitor, cmokit_sequence: held.sequence, cmokit_message: message.template },
      });
    } catch (error) {
      console.error(`sequence ${held.sequence}, message ${message.template}: ${(error as Error).message}`);
      const attempts = held.attempts + 1;
      if (attempts >= TRIES) {
        await this.stop('undeliverable', undefined);
        return null;
      }
      this.#sql.all(
        'UPDATE lead SET step = ?, next_at = ?, attempts = ?, state = \'active\' WHERE key = ?',
        held.step, now + RETRY_MS, attempts, held.key,
      );
      return now + RETRY_MS;
    }
    await this.#capture(held, 'message_sent', { message: message.template });
    if (!following) {
      this.#forget();
      await this.#capture(held, 'sequence_ended', { reason: 'finished' });
    }
    return next;
  }

  /** Ends the sequence, once per event. */
  async stop(reason: string, eventId: string | undefined): Promise<void> {
    if (eventId !== undefined) {
      if (this.#sql.all('SELECT id FROM seen WHERE id = ?', eventId).length > 0) return;
      this.#sql.all('INSERT INTO seen VALUES (?)', eventId);
    }
    const held = this.held();
    if (!held || held.state !== 'active') return;
    this.#sql.all('UPDATE lead SET state = \'stopped\', reason = ?, next_at = NULL WHERE key = ?', reason, held.key);
    this.#forget();
    await this.#capture(held, 'sequence_ended', { reason });
  }

  /**
   * Ends the sequence when `token` is the lead's own, and returns the address to suppress, or
   * undefined for a token that is not the lead's. An address already forgotten is returned as null.
   */
  async unsubscribe(token: string): Promise<string | null | undefined> {
    const held = this.held();
    if (!held || held.token !== token) return undefined;
    await this.stop('unsubscribed', undefined);
    return held.email;
  }

  #sequence(name: string) {
    return this.#deps.config.sequences.find((s) => s.name === name);
  }

  // A lead's address is kept only while it is being sent messages.
  #forget(): void {
    this.#sql.all('UPDATE lead SET email = NULL');
  }

  async #capture(held: Held, name: string, properties: Record<string, unknown>) {
    const captured = JSON.parse(held.properties) as Record<string, unknown>;
    await this.#deps.analytics.capture({
      name, visitor: held.visitor, properties: { ...captured, sequence: held.sequence, ...properties },
    }).catch(() => undefined);
  }
}
