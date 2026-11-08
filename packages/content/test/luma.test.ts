// The Luma adapter against responses shaped as Luma's API reference gives them (read 2026-11-07).
// They are written from the reference, not recorded from a real calendar: which of a ticket's amounts
// revenue is summed from is to be fixed against a recorded response (ADR-0032).

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { luma } from '../src/luma.ts';

function fakeLuma(pages: Record<string, unknown[]>) {
  const requests: { url: URL; key: string | null }[] = [];
  const fetcher = (async (input: URL | string, init?: RequestInit) => {
    const url = new URL(input);
    requests.push({ url, key: new Headers(init?.headers).get('x-luma-api-key') });
    if (new Headers(init?.headers).get('x-luma-api-key') !== 'k') return new Response('{}', { status: 401 });
    const queue = pages[url.pathname];
    if (!queue?.length) return new Response('{}', { status: 404 });
    return Response.json(queue.shift());
  }) as typeof fetch;
  return { fetcher, requests };
}

test('verify returns the calendar a key reaches, and undefined for a key Luma refuses', async () => {
  const { fetcher, requests } = fakeLuma({ '/v1/calendars/get': [{ id: 'cal-1', name: 'Table', slug: 'tabledialogue' }] });
  const events = luma(fetcher);
  assert.deepEqual(await events.verify('k'), { id: 'cal-1', name: 'Table' });
  assert.equal(await events.verify('wrong'), undefined);
  assert.equal(requests[0].url.origin, 'https://public-api.luma.com');
});

test('events are listed page by page within a range', async () => {
  const event = (id: string, url: string) => ({
    id, name: 'Table', url, start_at: '2026-11-18T14:00:00.000Z', end_at: '2026-11-18T15:30:00.000Z', timezone: 'America/New_York',
    geo_address_json: { address: 'Foley Hoag', city: 'New York' }, max_capacity: 40, spots_remaining: 12, access: 'manage',
  });
  const { fetcher, requests } = fakeLuma({
    '/v1/calendars/events/list': [
      { entries: [event('evt-1', 'table-nov')], has_more: true, next_cursor: 'c2' },
      { entries: [event('evt-2', 'https://luma.com/table-dec')], has_more: false },
    ],
  });
  const found = await luma(fetcher).list('k', { after: '2026-11-09T00:00:00.000Z' });
  assert.deepEqual(found.map((e) => [e.id, e.url, e.venue, e.capacity, e.remaining]), [
    ['evt-1', 'https://luma.com/table-nov', 'Foley Hoag', 40, 12],
    ['evt-2', 'https://luma.com/table-dec', 'Foley Hoag', 40, 12],
  ]);
  assert.equal(requests[0].url.searchParams.get('after'), '2026-11-09T00:00:00.000Z');
  assert.equal(requests[1].url.searchParams.get('pagination_cursor'), 'c2');
});

test('guests are counted per utm_content, and nothing about a guest leaves the adapter', async () => {
  const guest = (status: string, content: string | null, tickets: object[]) => ({
    id: 'gst', user_name: 'Grace Hopper', user_email: 'grace@example.com', approval_status: status,
    registration_answers: [{ answer: 'private' }], attribution_params: content ? { utm_content: content, utm_source: 'instagram' } : null,
    event_tickets: tickets,
  });
  const paid = { amount: 2700, amount_discount: 300, amount_tax: 200, currency: 'usd', checked_in_at: null, is_captured: true };
  const { fetcher, requests } = fakeLuma({
    '/v1/events/guests/list': [
      { entries: [guest('approved', 'p1', [paid]), guest('approved', 'p1', [{ ...paid, checked_in_at: '2026-11-18T14:05:00Z' }])], has_more: true, next_cursor: 'n' },
      { entries: [guest('approved', null, [paid]), guest('waitlist', 'p1', [paid]), guest('approved', 'p2', [])], has_more: false },
    ],
  });
  const found = await luma(fetcher).tally('k', 'evt-1');
  assert.deepEqual(found, {
    currency: 'usd',
    byContent: { p1: { registrations: 2, checkIns: 1, revenue: 5000 }, p2: { registrations: 1, checkIns: 0, revenue: 0 } },
    unattributed: { registrations: 1, checkIns: 0, revenue: 2500 },
  });
  assert.equal(requests[0].url.searchParams.get('event_id'), 'evt-1');
  assert.doesNotMatch(JSON.stringify(found), /Grace|grace@|private|gst/);
});
