import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createLifecycle, Lead, type Leads, type Report } from '../src/index.ts';
import { TEMPLATES, analyticsStandIn, messagingStandIn, resolved, sqlite } from './fixtures.ts';

const T0 = 1_800_000_000_000;

/** A lifecycle whose leads are real Lead objects on Node's SQLite, one per sequence and key. */
function setup(reports: Report[] = []) {
  const m = messagingStandIn(reports);
  const a = analyticsStandIn();
  const objects = new Map<string, Lead>();
  const object = (sequence: string, key: string) => {
    const name = `${sequence}:${key}`;
    if (!objects.has(name)) {
      objects.set(name, new Lead(sqlite(), { config: resolved, templates: TEMPLATES, messaging: m.messaging, analytics: a.analytics, newToken: () => `tok-${sequence}` }));
    }
    return objects.get(name)!;
  };
  const leads: Leads = {
    start: async (capture) => void await object(capture.sequence, capture.key).start(capture, T0),
    stop: (sequence, key, reason, eventId) => object(sequence, key).stop(reason, eventId),
    unsubscribe: (sequence, key, token) => object(sequence, key).unsubscribe(token),
  };
  const handle = createLifecycle({ config: resolved, leads, messaging: m.messaging, analytics: a.analytics });
  const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
    handle(new Request(`https://site.example${path}`, { method: 'POST', headers, body: typeof body === 'string' ? body : JSON.stringify(body) }));
  return { handle, post, object, objects, ...m, ...a };
}

const LEAD = { key: 'k1', email: 'ada@example.com', visitor: 'v1', event: 'signup', origin: 'https://site.example/pricing', properties: { utm_source: 'news' } };

test('a captured lead starts each sequence its event starts, and a later conversion ends it', async () => {
  const lc = setup();
  assert.equal((await lc.post('/internal/lead', LEAD)).status, 204);
  assert.deepEqual([...lc.objects.keys()], ['welcome:k1']);
  const held = lc.object('welcome', 'k1').held()!;
  assert.equal(held.origin, 'https://site.example');
  assert.equal(JSON.parse(held.properties).utm_source, 'news');

  assert.equal((await lc.post('/internal/lead', { ...LEAD, email: 'not an address' })).status, 400);
  assert.equal((await lc.post('/internal/event', { key: 'k1', event: 'pageview' })).status, 204);
  assert.equal(lc.object('welcome', 'k1').held()?.state, 'active', 'an event that stops nothing');
  await lc.post('/internal/event', { key: 'k1', event: 'trial_started' });
  assert.equal(lc.object('welcome', 'k1').held()?.reason, 'converted: trial_started');
});

test('following an unsubscribe link asks; posting it, or a one-click unsubscribe, stops every sequence', async () => {
  const lc = setup();
  await lc.post('/internal/lead', LEAD);
  await lc.post('/internal/lead', { ...LEAD, event: 'webinar' });
  const url = '/_cmokit/leads/unsubscribe?s=welcome&l=k1&t=tok-welcome';
  const asked = await lc.handle(new Request(`https://site.example${url}`));
  assert.equal(asked.status, 200);
  assert.match(await asked.text(), /<form method="post">/);
  assert.equal(lc.object('welcome', 'k1').held()?.state, 'active', 'a scanner following the link unsubscribes no one');

  assert.equal((await lc.post(url.replace('tok-welcome', 'guess'), '')).status, 400);
  const done = await lc.post(url, 'List-Unsubscribe=One-Click', { 'content-type': 'application/x-www-form-urlencoded' });
  assert.equal(done.status, 200);
  assert.match(await done.text(), /You are unsubscribed/);
  assert.equal(lc.object('welcome', 'k1').held()?.reason, 'unsubscribed');
  assert.equal(lc.object('webinar', 'k1').held()?.reason, 'unsubscribed');
  assert.deepEqual(lc.suppressed, ['42:ada@example.com']);
});

test('an unsubscribe the sending service cannot record still ends the sequences, and says so', async () => {
  const lc = setup();
  await lc.post('/internal/lead', LEAD);
  lc.fail(true);
  const done = await lc.post('/_cmokit/leads/unsubscribe?s=welcome&l=k1&t=tok-welcome', '');
  assert.equal(done.status, 200);
  assert.equal(lc.object('welcome', 'k1').held()?.reason, 'unsubscribed');
});

test('the sending service\'s events are recorded once each, and a bounce ends the sequence', async () => {
  const tags = { cmokit_lead: 'k1', cmokit_visitor: 'v1', cmokit_sequence: 'welcome', cmokit_message: 'welcome' };
  const lc = setup([
    { id: 'e1', kind: 'opened', at: T0, tags },
    { id: 'e2', kind: 'clicked', at: T0, tags, url: 'https://site.example/guide' },
    { id: 'e3', kind: 'bounced', at: T0, tags },
    { id: 'e4', kind: 'other', at: T0, tags },
    { id: 'e5', kind: 'opened', at: T0, tags: {} },
  ]);
  await lc.post('/internal/lead', LEAD);
  lc.events.length = 0;
  assert.equal((await lc.post('/_cmokit/leads/events', '[]')).status, 403, 'not genuinely from the service');
  assert.equal((await lc.post('/_cmokit/leads/events', '[]', { 'x-genuine': 'yes' })).status, 204);
  assert.deepEqual(lc.events.map((e) => [e.name, e.id]), [
    ['message_opened', 'e1'], ['message_clicked', 'e2'], ['message_bounced', 'e3'], ['sequence_ended', undefined],
  ]);
  assert.equal(lc.events[1].properties.url, 'https://site.example/guide');
  assert.equal(lc.events[0].visitor, 'v1');
  assert.equal(lc.object('welcome', 'k1').held()?.reason, 'bounced');
});

test('anything else is not found', async () => {
  const lc = setup();
  assert.equal((await lc.handle(new Request('https://site.example/'))).status, 404);
  assert.equal((await lc.handle(new Request('https://site.example/internal/lead'))).status, 404, 'internal routes take POST only');
});
