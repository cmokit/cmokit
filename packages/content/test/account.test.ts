import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createContentServer, type Tokens } from '../src/index.ts';
import { newCustomer, readyCustomer } from './fixtures.ts';

const ORIGIN = 'https://mcp.example';
const APP = 'https://app.example';
const ISSUER = 'https://auth.example';
const tokens: Tokens = {
  async check(token) {
    if (token === 'ada-token') return { person: 'ada', audience: ORIGIN, customer: 'acme' };
    if (token === 'bob-token') return { person: 'bob', audience: ORIGIN, customer: 'acme' };
    if (token === 'new-token') return { person: 'new', audience: ORIGIN };
    if (token === 'other-audience') return { person: 'ada', audience: 'https://elsewhere.example', customer: 'acme' };
    return undefined;
  },
};

async function server(options: { terms?: boolean } = {}) {
  const acme = await readyCustomer();
  const exchanged: URLSearchParams[] = [];
  const handle = createContentServer({
    issuer: ISSUER, audience: ORIGIN, tokens,
    customer: (slug) => (slug === 'acme' ? acme.customer : newCustomer().customer),
    customersOf: async () => [],
    ...(options.terms ? { terms: { url: 'https://example.com/terms', version: '2026-11-08' } } : {}),
    account: {
      origin: APP,
      exchange: async (form) => {
        exchanged.push(form);
        return form.get('code') === 'good-code' ? { access_token: 'ada-token', expires_in: 3600 } : undefined;
      },
      email: async (person) => (person === 'ada' ? 'ada@example.com' : null),
    },
  });
  const get = (path: string, cookie?: string) => handle(new Request(`${APP}${path}`, cookie ? { headers: { cookie } } : {}));
  return { handle, get, exchanged };
}

const session = (token: string) => `__Host-cmokit-session=${token}`;

test('the account page describes itself as a public OAuth client by its metadata document', async () => {
  const { get } = await server();
  assert.deepEqual(await (await get('/client.json')).json(), {
    client_id: `${APP}/client.json`, client_name: 'CMOkit account', client_uri: APP,
    redirect_uris: [`${APP}/callback`], grant_types: ['authorization_code'], response_types: ['code'],
    token_endpoint_auth_method: 'none',
  });
});

test('signing in sends the person to the issuer with PKCE, and the callback keeps the token in an HttpOnly cookie', async () => {
  const { get, exchanged } = await server();
  const start = await get('/signin');
  assert.equal(start.status, 302);
  const authorize = new URL(start.headers.get('location')!);
  assert.equal(`${authorize.origin}${authorize.pathname}`, `${ISSUER}/authorize`);
  assert.equal(authorize.searchParams.get('client_id'), `${APP}/client.json`);
  assert.equal(authorize.searchParams.get('redirect_uri'), `${APP}/callback`);
  assert.equal(authorize.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(authorize.searchParams.get('resource'), ORIGIN);
  const state = authorize.searchParams.get('state')!;
  const signin = start.headers.get('set-cookie')!;
  assert.match(signin, /^__Host-cmokit-signin=[^;]+; .*HttpOnly/);
  const pair = signin.split(';')[0];

  // A callback whose state is not the one this browser started is refused, and no code is traded.
  const forged = await get(`/callback?code=good-code&state=other`, pair);
  assert.equal(forged.headers.get('location'), '/signin');
  assert.equal(exchanged.length, 0);

  const done = await get(`/callback?code=good-code&state=${state}`, pair);
  assert.equal(done.status, 302);
  assert.equal(done.headers.get('location'), '/');
  const sent = exchanged[0];
  assert.equal(sent.get('grant_type'), 'authorization_code');
  assert.equal(sent.get('client_id'), `${APP}/client.json`);
  assert.equal(sent.get('code_verifier'), pair.split('=')[1].split('.')[1]);
  const cookies = done.headers.getSetCookie();
  const kept = cookies.find((c) => c.startsWith('__Host-cmokit-session=ada-token'))!;
  assert.match(kept, /HttpOnly/);
  assert.match(kept, /Secure/);
  assert.match(kept, /SameSite=Lax/);
  assert.match(kept, /Max-Age=3600/);

  const refused = await get(`/callback?code=bad-code&state=${state}`, pair);
  assert.equal(refused.headers.get('location'), '/signin');
});

test('the page shows the signed-in account, its brand context and connections, and changes nothing', async () => {
  const { get } = await server({ terms: true });
  const page = await get('/', session('ada-token'));
  assert.equal(page.status, 200);
  const html = await page.text();
  assert.match(html, /ada@example\.com/);
  assert.match(html, /A breakfast for founders\./);
  assert.match(html, /Table/);
  assert.match(html, /not accepted .*the beta terms/);
  assert.match(html, /\/customers\/acme\/terms\?t=/);
  assert.match(html, /ask Claude/);
  assert.doesNotMatch(html, /<form[^>]*action="\/(?!signout)/);
});

test('without a valid session, the page and the export send the person to sign in', async () => {
  const { get } = await server();
  for (const cookie of [undefined, session('forged'), session('other-audience')]) {
    for (const path of ['/', '/export']) {
      const response = await get(path, cookie);
      assert.equal(response.status, 302, `${path} ${cookie}`);
      assert.equal(response.headers.get('location'), '/signin');
    }
  }
});

test('a person who is not a user of the customer is refused, and one with no customer sees an empty account', async () => {
  const { get } = await server();
  assert.equal((await get('/', session('bob-token'))).status, 403);
  assert.equal((await get('/export', session('bob-token'))).status, 403);
  const empty = await get('/', session('new-token'));
  assert.equal(empty.status, 200);
  assert.equal((await get('/export', session('new-token'))).status, 404);
});

test('the export downloads everything held for the customer', async () => {
  const { get } = await server();
  const response = await get('/export', session('ada-token'));
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-disposition')!, /attachment; filename="cmokit-export\.json"/);
  assert.match(await response.text(), /A breakfast for founders\./);
});

test('signing out clears the session, and other paths at the account origin fall through to the content server', async () => {
  const { handle, get } = await server();
  const out = await handle(new Request(`${APP}/signout`, { method: 'POST', headers: { cookie: session('ada-token') } }));
  assert.ok(out.headers.getSetCookie().some((c) => c.startsWith('__Host-cmokit-session=;') && /Max-Age=0/.test(c)));
  assert.equal((await get('/.well-known/oauth-protected-resource/mcp')).status, 200);
  // At the MCP origin the account paths are not served.
  assert.notEqual((await handle(new Request(`${ORIGIN}/client.json`))).status, 200);
});
