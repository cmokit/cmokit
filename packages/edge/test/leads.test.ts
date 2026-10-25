import assert from 'node:assert/strict';
import { test } from 'node:test';
import { leadKey, resolve } from '@cmokit/cli';
import { createEdge, type AnalyticsEvent, type CapturedLead, type Lifecycle } from '../src/index.ts';

const BROWSER = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 15_0) AppleWebKit/605.1.15 Safari/605.1.15';

const config = resolve({
  analytics: { posthog: { key: 'phc_test' } },
  experiments: [{ flag: 'landing', path: '/', variants: { b: '/b/' }, goal: 'signup', status: 'running' }],
  messaging: { from: 'hello@site.example', address: '1 Main St', sendgrid: { unsubscribeGroup: 42 } },
  sequences: [{ name: 'welcome', start: 'signup', stop: ['trial_started'], messages: [{ template: 'welcome', after: '0m' }] }],
});

function setup(withLifecycle = true) {
  const events: AnalyticsEvent[] = [];
  const captured: CapturedLead[] = [];
  const later: string[] = [];
  const forwarded: string[] = [];
  const work: Promise<unknown>[] = [];
  const lifecycle: Lifecycle = {
    capture: async (lead) => void captured.push(lead),
    event: async (key, name) => void later.push(`${key}:${name}`),
    forward: async (request) => {
      forwarded.push(new URL(request.url).pathname);
      return new Response('from the lifecycle');
    },
  };
  const handle = createEdge({
    config,
    origin: async () => new Response('page', { headers: { 'content-type': 'text/html' } }),
    tools: {
      experiments: { variantFor: async () => 'b' },
      analytics: { capture: async (e) => void events.push(e), relay: async () => new Response() },
      ...(withLifecycle ? { lifecycle } : {}),
    },
    background: (p) => void work.push(p),
  });
  return {
    events, captured, later, forwarded,
    async convert(body: object, cookie = 'cmokit_id=v1; cmokit_x_landing=b') {
      const response = await handle(new Request('https://site.example/_cmokit/convert', {
        method: 'POST',
        headers: { 'user-agent': BROWSER, cookie, referer: 'https://site.example/?utm_source=news&plan=pro', 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }));
      await Promise.all(work);
      return response;
    },
    get: (path: string) => handle(new Request(`https://site.example${path}`, { headers: { 'user-agent': BROWSER } })),
  };
}

test('a conversion with an address captures a lead with its variant and channel, and remembers it', async () => {
  const edge = setup();
  const response = await edge.convert({ name: 'signup', email: ' Ada@Example.com ' });
  assert.equal(response.status, 204);
  const key = await leadKey('ada@example.com');
  assert.deepEqual(edge.captured, [{
    key, email: 'Ada@Example.com', visitor: 'v1', event: 'signup', origin: 'https://site.example',
    properties: { '$feature/landing': 'b', $current_url: 'https://site.example/?utm_source=news&plan=pro', utm_source: 'news' },
  }]);
  assert.match(response.headers.get('set-cookie') ?? '', new RegExp(`^cmokit_lead=${key};`));
  assert.deepEqual(edge.events[0].properties.$set, { email: 'Ada@Example.com' });
  assert.equal(edge.events[0].properties.utm_source, 'news');
});

test('a later conversion by the lead may end its sequence; others are only recorded', async () => {
  const edge = setup();
  await edge.convert({ name: 'trial_started' }, 'cmokit_id=v1; cmokit_lead=k1');
  await edge.convert({ name: 'pricing_viewed' }, 'cmokit_id=v1; cmokit_lead=k1');
  await edge.convert({ name: 'trial_started' }, 'cmokit_id=v1');
  assert.deepEqual(edge.later, ['k1:trial_started']);
  assert.equal(edge.events.length, 3);
});

test('no lead is captured without an address, for an event that starts no sequence, or without a lifecycle', async () => {
  const edge = setup();
  await edge.convert({ name: 'signup' });
  await edge.convert({ name: 'signup', email: 'not-an-address' });
  await edge.convert({ name: 'webinar', email: 'ada@example.com' });
  assert.deepEqual(edge.captured, []);
  const without = setup(false);
  const response = await without.convert({ name: 'signup', email: 'ada@example.com' });
  assert.equal(response.headers.get('set-cookie'), null);
});

test('only the lifecycle\'s public routes are passed on', async () => {
  const edge = setup();
  assert.equal(await (await edge.get('/_cmokit/leads/unsubscribe?s=welcome&l=k&t=t')).text(), 'from the lifecycle');
  assert.equal((await edge.get('/_cmokit/leads/events')).status, 200);
  assert.equal((await edge.get('/_cmokit/leads/anything')).status, 404);
  assert.deepEqual(edge.forwarded, ['/_cmokit/leads/unsubscribe', '/_cmokit/leads/events']);
  assert.equal((await setup(false).get('/_cmokit/leads/unsubscribe')).status, 404);
});
