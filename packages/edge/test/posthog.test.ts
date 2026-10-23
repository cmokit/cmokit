import assert from 'node:assert/strict';
import { test } from 'node:test';
import { posthog } from '../src/posthog.ts';

function recorder(reply: (url: string) => Response) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetch = (async (url: string | URL, init: RequestInit = {}) => {
    calls.push({ url: String(url), init });
    return reply(String(url));
  }) as typeof globalThis.fetch;
  return { calls, fetch };
}

const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });

test('a visitor gets the variant PostHog evaluates', async () => {
  const r = recorder(() => json({ flags: { landing: { enabled: true, variant: 'b' } } }));
  const tools = posthog({ key: 'phc_test', host: 'https://us.i.posthog.com/', fetch: r.fetch });
  assert.equal(await tools.experiments.variantFor('v1', 'landing'), 'b');
  assert.equal(r.calls[0].url, 'https://us.i.posthog.com/flags?v=2');
  assert.deepEqual(JSON.parse(String(r.calls[0].init.body)), { api_key: 'phc_test', distinct_id: 'v1' });
});

test('a disabled, unknown or failed flag gives no variant', async () => {
  for (const reply of [
    json({ flags: { landing: { enabled: false, variant: null } } }),
    json({ flags: {} }),
    new Response('error', { status: 500 }),
  ]) {
    const tools = posthog({ key: 'k', host: 'https://h', fetch: recorder(() => reply).fetch });
    assert.equal(await tools.experiments.variantFor('v1', 'landing'), undefined);
  }
});

test('an event is captured for the visitor', async () => {
  const r = recorder(() => new Response('ok'));
  await posthog({ key: 'k', host: 'https://h', fetch: r.fetch }).analytics.capture({
    name: 'signup', visitor: 'v1', properties: { a: 1 },
  });
  const body = JSON.parse(String(r.calls[0].init.body));
  assert.equal(r.calls[0].url, 'https://h/i/v0/e/');
  assert.equal(body.event, 'signup');
  assert.equal(body.distinct_id, 'v1');
  assert.deepEqual(body.properties, { a: 1 });
});

test('the relay forwards to the ingestion or assets host without the site cookies', async () => {
  const r = recorder(() => new Response('ok', { headers: { 'set-cookie': 'x=1' } }));
  const { analytics } = posthog({ key: 'k', host: 'https://eu.i.posthog.com', fetch: r.fetch });
  const response = await analytics.relay(new Request('https://site.example/_cmokit/a/e/?ip=1', {
    method: 'POST', body: 'payload', headers: { cookie: 'cmokit_id=v1', 'cf-connecting-ip': '203.0.113.9' },
  }), '/e/');
  assert.equal(r.calls[0].url, 'https://eu.i.posthog.com/e/?ip=1');
  const headers = new Headers(r.calls[0].init.headers);
  assert.equal(headers.get('cookie'), null);
  assert.equal(headers.get('x-forwarded-for'), '203.0.113.9');
  assert.equal(response.headers.get('set-cookie'), null);

  await analytics.relay(new Request('https://site.example/_cmokit/a/static/recorder.js'), '/static/recorder.js');
  assert.equal(r.calls[1].url, 'https://eu-assets.i.posthog.com/static/recorder.js');
});
