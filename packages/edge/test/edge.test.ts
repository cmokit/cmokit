import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Resolved, Status } from '@cmokit/cli';
import { createEdge, parseCookies, type AnalyticsEvent, type EdgeOptions } from '../src/index.ts';

const BROWSER = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 15_0) AppleWebKit/605.1.15 Safari/605.1.15';

const config = (status: Status): Resolved => ({
  analytics: { posthog: { key: 'phc_test', host: 'https://ph.example', app: 'https://ph.example' } },
  experiments: [{
    flag: 'landing', path: '/', variants: { b: '/variants/landing/b/' }, goal: 'signup', split: { control: 50, b: 50 }, status,
  }],
});

const PAGES: Record<string, string> = {
  '/': 'control page',
  '/variants/landing/b/': 'variant b page',
  '/about/': 'about page',
};

interface Setup {
  status?: Status;
  variant?: () => Promise<string | undefined>;
  pages?: Record<string, string>;
}

function setup(s: Setup = {}) {
  const events: AnalyticsEvent[] = [];
  const asked: string[] = [];
  const work: Promise<unknown>[] = [];
  const fetched: string[] = [];
  const pages = s.pages ?? PAGES;
  const options: EdgeOptions = {
    config: config(s.status ?? 'running'),
    origin: async (request) => {
      fetched.push(request.url);
      const path = new URL(request.url).pathname;
      return path in pages
        ? new Response(pages[path], { headers: { 'content-type': 'text/html', 'cache-control': 'max-age=600' } })
        : new Response('not found', { status: 404 });
    },
    tools: {
      experiments: {
        variantFor: async (visitor, flag) => {
          asked.push(`${visitor}:${flag}`);
          return s.variant ? s.variant() : 'b';
        },
      },
      analytics: {
        capture: async (event) => void events.push(event),
        relay: async (_request, path) => new Response(`relayed ${path}`),
      },
    },
    background: (p) => void work.push(p),
    newVisitor: () => 'visitor-1',
  };
  const handle = createEdge(options);
  return {
    events,
    asked,
    fetched,
    async get(path: string, headers: Record<string, string> = {}) {
      const response = await handle(new Request(`https://site.example${path}`, {
        headers: { accept: 'text/html', 'user-agent': BROWSER, ...headers },
      }));
      await Promise.all(work);
      return { response, body: await response.text(), cookies: response.headers.getSetCookie() };
    },
    async post(path: string, body: unknown, headers: Record<string, string> = {}) {
      const response = await handle(new Request(`https://site.example${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'user-agent': BROWSER, ...headers },
        body: JSON.stringify(body),
      }));
      await Promise.all(work);
      return response;
    },
  };
}

test('a new visitor is assigned, served their variant at the page address, and exposed', async () => {
  const edge = setup();
  const { response, body, cookies } = await edge.get('/?utm_source=news');
  assert.equal(body, 'variant b page');
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  assert.deepEqual(cookies.map((c) => c.split(';')[0]), ['cmokit_id=visitor-1', 'cmokit_x_landing=b']);
  assert.deepEqual(edge.asked, ['visitor-1:landing']);
  assert.equal(edge.events.length, 1);
  assert.equal(edge.events[0].name, '$feature_flag_called');
  assert.equal(edge.events[0].visitor, 'visitor-1');
  assert.equal(edge.events[0].properties.$feature_flag, 'landing');
  assert.equal(edge.events[0].properties.$feature_flag_response, 'b');
  assert.equal(edge.events[0].properties.utm_source, 'news');
});

test('a variant\'s page gets the query its page was requested with, and the exposure its channel', async () => {
  const edge = setup();
  await edge.get('/?utm_source=ads&gclid=abc&fbclid=def&plan=pro&utm_x=1');
  assert.deepEqual(edge.fetched, ['https://site.example/variants/landing/b/?utm_source=ads&gclid=abc&fbclid=def&plan=pro&utm_x=1']);
  const { properties } = edge.events[0];
  assert.equal(properties.utm_source, 'ads');
  assert.equal(properties.gclid, 'abc');
  assert.equal(properties.fbclid, 'def');
  assert.equal('plan' in properties, false, 'a parameter naming no channel is only in the URL');
  assert.equal('utm_x' in properties, false);
  assert.equal(properties.$current_url, 'https://site.example/?utm_source=ads&gclid=abc&fbclid=def&plan=pro&utm_x=1');
});

test('a preview\'s variant page gets the query without the preview parameter', async () => {
  const edge = setup();
  await edge.get('/?cmokit_variant=b&plan=pro');
  assert.deepEqual(edge.fetched, ['https://site.example/variants/landing/b/?plan=pro']);
  await edge.get('/?cmokit_variant=control&plan=pro');
  assert.equal(edge.fetched[1], 'https://site.example/?cmokit_variant=control&plan=pro', 'the control is the request itself');
});

test('a returning visitor keeps their variant without asking the tool', async () => {
  const edge = setup();
  const { body, cookies } = await edge.get('/', { cookie: 'cmokit_id=v9; cmokit_x_landing=b' });
  assert.equal(body, 'variant b page');
  assert.deepEqual(cookies, []);
  assert.deepEqual(edge.asked, []);
  assert.equal(edge.events[0].visitor, 'v9');
});

test('the control is served from the page itself and still exposed', async () => {
  const edge = setup({ variant: async () => 'control' });
  const { body, cookies } = await edge.get('/');
  assert.equal(body, 'control page');
  assert.ok(cookies.some((c) => c.startsWith('cmokit_x_landing=control')));
  assert.equal(edge.events[0].properties.$feature_flag_response, 'control');
});

test('an unreachable tool serves the control unassigned', async () => {
  const edge = setup({ variant: async () => { throw new Error('down'); } });
  const { body, cookies } = await edge.get('/');
  assert.equal(body, 'control page');
  assert.deepEqual(cookies.map((c) => c.split(';')[0]), ['cmokit_id=visitor-1']);
  assert.equal(edge.events.length, 0);
});

test('a variant the configuration does not know is treated as no answer', async () => {
  const edge = setup({ variant: async () => 'retired' });
  const { body } = await edge.get('/', { cookie: 'cmokit_id=v9; cmokit_x_landing=old' });
  assert.equal(body, 'control page');
  assert.equal(edge.events.length, 0);
});

test('a missing variant page serves the control unassigned', async () => {
  const edge = setup({ pages: { '/': 'control page' } });
  const { body, cookies } = await edge.get('/');
  assert.equal(body, 'control page');
  assert.ok(!cookies.some((c) => c.startsWith('cmokit_x_landing=')));
  assert.equal(edge.events.length, 0);
});

for (const status of ['draft', 'ended'] as const) {
  test(`a ${status} experiment serves its page to everyone, unassigned and unrecorded`, async () => {
    const edge = setup({ status });
    const fresh = await edge.get('/');
    assert.equal(fresh.body, 'control page');
    assert.deepEqual(fresh.cookies.map((c) => c.split(';')[0]), ['cmokit_id=visitor-1']);
    const assigned = await edge.get('/', { cookie: 'cmokit_id=v9; cmokit_x_landing=b' });
    assert.equal(assigned.body, 'control page');
    assert.deepEqual(edge.asked, []);
    assert.equal(edge.events.length, 0);
    assert.equal((await edge.get('/variants/landing/b/')).response.status, 302);
    assert.equal((await edge.get('/?cmokit_variant=b')).body, 'variant b page');
  });
}

test('a conversion carries only running experiments\' variants', async () => {
  const edge = setup({ status: 'ended' });
  await edge.post('/_cmokit/convert', { name: 'signup' }, { cookie: 'cmokit_id=v9; cmokit_x_landing=b' });
  assert.equal(edge.events[0].properties['$feature/landing'], undefined);
});

test('agents get the control, no cookie and no exposure, and are labeled', async () => {
  const edge = setup();
  const { response, body, cookies } = await edge.get('/', { 'user-agent': 'Mozilla/5.0 (compatible; ClaudeBot/1.0)' });
  assert.equal(body, 'control page');
  assert.deepEqual(cookies, []);
  assert.equal(response.headers.get('x-cmokit-agent'), '1');
  assert.deepEqual(edge.asked, []);
  assert.deepEqual(edge.events.map((e) => e.name), ['agent_visit']);
  assert.equal(edge.events[0].properties.$process_person_profile, false);
});

test('a variant page address redirects to the page under experiment', async () => {
  const { response } = await setup().get('/variants/landing/b/?utm_source=x');
  assert.equal(response.status, 302);
  assert.equal(response.headers.get('location'), 'https://site.example/?utm_source=x');
});

test('a preview shows a variant without assigning or recording', async () => {
  const edge = setup();
  const preview = await edge.get('/?cmokit_variant=b');
  assert.equal(preview.body, 'variant b page');
  assert.deepEqual(preview.cookies, []);
  assert.equal(edge.events.length, 0);
  assert.equal((await edge.get('/variants/landing/b/?cmokit_variant=b')).body, 'variant b page');
});

test('pages not under experiment pass through and give a new visitor an id', async () => {
  const edge = setup();
  const first = await edge.get('/about/');
  assert.equal(first.body, 'about page');
  assert.deepEqual(first.cookies.map((c) => c.split(';')[0]), ['cmokit_id=visitor-1']);
  const again = await edge.get('/about/', { cookie: 'cmokit_id=visitor-1' });
  assert.deepEqual(again.cookies, []);
  assert.equal(again.response.headers.get('cache-control'), 'max-age=600');
});

test('a conversion is captured server-side with the visitor and their variants', async () => {
  const edge = setup();
  const response = await edge.post('/_cmokit/convert', { name: 'signup' }, {
    cookie: 'cmokit_id=v9; cmokit_x_landing=b', origin: 'https://site.example', referer: 'https://site.example/',
  });
  assert.equal(response.status, 204);
  assert.equal(edge.events[0].name, 'signup');
  assert.equal(edge.events[0].visitor, 'v9');
  assert.equal(edge.events[0].properties['$feature/landing'], 'b');
});

test('a conversion from another site is refused, and one without a visitor is dropped', async () => {
  const edge = setup();
  assert.equal((await edge.post('/_cmokit/convert', {}, { cookie: 'cmokit_id=v9', origin: 'https://evil.example' })).status, 403);
  assert.equal((await edge.post('/_cmokit/convert', {}, {})).status, 204);
  assert.equal(edge.events.length, 0);
});

test('an invalid event name is recorded as a conversion', async () => {
  const edge = setup();
  await edge.post('/_cmokit/convert', { name: 'Drop Table' }, { cookie: 'cmokit_id=v9' });
  assert.equal(edge.events[0].name, 'conversion');
});

test('browser analytics are relayed', async () => {
  const response = await setup().post('/_cmokit/a/i/v0/e/', {});
  assert.equal(await response.text(), 'relayed /i/v0/e/');
});

test('cookies are parsed and decoded', () => {
  assert.deepEqual(parseCookies('a=1; b=x%20y; bad; =z'), { a: '1', b: 'x y' });
  assert.deepEqual(parseCookies(null), {});
});
