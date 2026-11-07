// Shared test fixtures: a customer's records on Node's SQLite, with a stand-in for the event platform.

import { DatabaseSync } from 'node:sqlite';
import { Customer, aesGcmVault, tally, type EventSummary, type Events, type GuestFacts, type Sql } from '../src/index.ts';

export const KEY = btoa(String.fromCharCode(...new Uint8Array(32).map((_, i) => i)));
export const CALENDAR_KEY = 'secret-calendar-key-123';
export const T0 = Date.parse('2026-11-09T12:00:00Z');

export function sqlite(): Sql {
  const db = new DatabaseSync(':memory:');
  return { all: (query, ...params) => db.prepare(query).all(...params) as ReturnType<Sql['all']> };
}

export const EVENTS: EventSummary[] = [
  { id: 'evt-1', name: 'Table', url: 'https://luma.com/table-nov', start: '2026-11-18T14:00:00.000Z', end: null, timezone: 'America/New_York', venue: 'Foley Hoag', capacity: 40, remaining: 12 },
  { id: 'evt-2', name: 'Table', url: 'https://luma.com/table-dec', start: '2026-12-09T14:00:00.000Z', end: null, timezone: 'America/New_York', venue: 'Foley Hoag', capacity: null, remaining: null },
];

/** A stand-in for the events interface: one calendar, with guests per event, recording its calls. */
export function eventsStandIn(guests: Record<string, GuestFacts[]> = {}) {
  const calls: { call: string; key: string; detail?: unknown }[] = [];
  const events: Events = {
    vendor: 'stand-in', label: 'Stand-in Events', keyHelp: 'Make a key in the stand-in.',
    async verify(key) {
      calls.push({ call: 'verify', key });
      return key === CALENDAR_KEY ? { id: 'cal-1', name: 'Table calendar' } : undefined;
    },
    async list(key, range) {
      calls.push({ call: 'list', key, detail: range });
      return EVENTS.filter((e) => (!range.after || e.start >= range.after) && (!range.before || e.start < range.before));
    },
    async tally(key, eventId) {
      calls.push({ call: 'tally', key, detail: eventId });
      return tally(guests[eventId] ?? []);
    },
  };
  return { events, calls };
}

export function newCustomer(guests: Record<string, GuestFacts[]> = {}) {
  let now = T0;
  let n = 0;
  const { events, calls } = eventsStandIn(guests);
  const sql = sqlite();
  const customer = new Customer(sql, { vault: aesGcmVault(KEY), events, now: () => now, newId: () => `p${++n}` });
  return { customer, calls, sql, later: (ms: number) => { now += ms; } };
}

/** A customer with a user, a connected calendar and a first brand context with one offer. */
export async function readyCustomer(guests: Record<string, GuestFacts[]> = {}) {
  const made = newCustomer(guests);
  const { customer } = made;
  await customer.addUser('ada');
  const { missing } = await customer.status('ada', 'https://content.example/customers/acme');
  const token = new URL(missing[0].link).searchParams.get('t')!;
  await customer.connect(token, CALENDAR_KEY);
  await customer.brandChange('ada', {
    approved: true, base_version: 0, reason: 'First version, from the brand sprint',
    sections: { positioning: 'A breakfast for founders.', voice: 'Warm, plain, short.' },
    offers: [{ id: 'table', name: 'Table', pattern: 'series', aliases: ['Table (formerly Startup Lean Coffee)'] }],
  });
  return made;
}

export const guest = (content: string | null, revenue = 0, checkedIn = false): GuestFacts =>
  ({ registered: true, checkedIn, content, revenue, currency: revenue ? 'usd' : null });
