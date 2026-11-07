// The events interface's adapter for Luma (ADR-0032), on its public API with a calendar key in the
// `x-luma-api-key` header. It reads a calendar's events and an event's guests, page by page, and
// passes on only what `GuestFacts` names.
//
// Endpoints and fields as Luma's API reference gives them (read 2026-11-07): GET
// /v1/calendars/get, /v1/calendars/events/list (before, after, pagination_cursor, sort_column
// start_at) and /v1/events/guests/list (event_id), each list answering `entries`, `has_more` and
// `next_cursor`. The reference types a ticket's `amount`, `amount_discount` and `amount_tax` as
// numbers without saying their unit or whether `amount` is before the discount; elsewhere it gives
// prices in minor units. Revenue is taken as `amount` less `amount_tax` for each captured ticket, in
// minor units, until a recorded response from a real calendar confirms it. Refunds are on a guest's
// orders, which only the single-guest read returns, and are not yet subtracted.

import { tally, type EventSummary, type Events, type GuestFacts, type Tally } from './events.ts';

const API = 'https://public-api.luma.com';
const PAGE = 100;

interface Page<T> {
  entries: T[];
  has_more: boolean;
  next_cursor?: string;
}

interface LumaEvent {
  id: string;
  name: string;
  url: string;
  start_at: string;
  end_at?: string | null;
  timezone?: string | null;
  geo_address_json?: { address?: string | null } | null;
  max_capacity?: number | null;
  spots_remaining?: number | null;
}

interface LumaTicket {
  amount?: number | null;
  amount_tax?: number | null;
  currency?: string | null;
  checked_in_at?: string | null;
  is_captured?: boolean;
}

interface LumaGuest {
  approval_status: string;
  attribution_params?: Record<string, string> | null;
  event_tickets?: LumaTicket[];
}

export function luma(fetcher: typeof fetch = fetch): Events {
  async function get<T>(key: string, path: string, query: Record<string, string> = {}): Promise<T> {
    const url = new URL(path, API);
    for (const [name, value] of Object.entries(query)) url.searchParams.set(name, value);
    const response = await fetcher(url, { headers: { 'x-luma-api-key': key, accept: 'application/json' } });
    if (!response.ok) throw new LumaError(response.status);
    return response.json() as Promise<T>;
  }

  async function all<T>(key: string, path: string, query: Record<string, string>): Promise<T[]> {
    const found: T[] = [];
    let cursor: string | undefined;
    do {
      const page = await get<Page<T>>(key, path, { ...query, pagination_limit: String(PAGE), ...(cursor ? { pagination_cursor: cursor } : {}) });
      found.push(...page.entries);
      cursor = page.has_more ? page.next_cursor : undefined;
    } while (cursor);
    return found;
  }

  return {
    vendor: 'luma',
    label: 'Luma',
    keyHelp: 'In Luma, open your calendar, then Settings, then Developer, and create an API key. The API needs Luma Plus on the calendar.',

    async verify(key) {
      try {
        const answer = await get<{ id: string; name: string; calendar?: { id: string; name: string } }>(key, '/v1/calendars/get');
        const calendar = answer.calendar ?? answer;
        return { id: calendar.id, name: calendar.name };
      } catch (error) {
        if (error instanceof LumaError && (error.status === 401 || error.status === 403)) return undefined;
        throw error;
      }
    },

    async list(key, range) {
      const query: Record<string, string> = { sort_column: 'start_at', sort_direction: 'asc' };
      if (range.after) query.after = range.after;
      if (range.before) query.before = range.before;
      const events = await all<LumaEvent>(key, '/v1/calendars/events/list', query);
      return events.map(summary);
    },

    async tally(key, eventId): Promise<Tally> {
      const guests = await all<LumaGuest>(key, '/v1/events/guests/list', { event_id: eventId });
      return tally(guests.map(facts));
    },
  };
}

class LumaError extends Error {
  readonly status: number;
  constructor(status: number) {
    super(`The event platform answered ${status}`);
    this.status = status;
  }
}

function summary(event: LumaEvent): EventSummary {
  return {
    id: event.id,
    name: event.name,
    url: event.url.startsWith('http') ? event.url : `https://luma.com/${event.url}`,
    start: event.start_at,
    end: event.end_at ?? null,
    timezone: event.timezone ?? null,
    venue: event.geo_address_json?.address ?? null,
    capacity: event.max_capacity ?? null,
    remaining: event.spots_remaining ?? null,
  };
}

function facts(guest: LumaGuest): GuestFacts {
  const tickets = (guest.event_tickets ?? []).filter((t) => t.is_captured !== false);
  return {
    registered: guest.approval_status === 'approved',
    checkedIn: (guest.event_tickets ?? []).some((t) => Boolean(t.checked_in_at)),
    content: guest.attribution_params?.utm_content || null,
    revenue: tickets.reduce((sum, t) => sum + (t.amount ?? 0) - (t.amount_tax ?? 0), 0),
    currency: tickets.find((t) => t.currency)?.currency ?? null,
  };
}
