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

async function server(options: { terms?: boolean; brands?: boolean; owner?: string; down?: boolean } = {}) {
  const acme = await readyCustomer();
  const exchanged: URLSearchParams[] = [];
  const added: [string, string][] = [];
  const activated: string[] = [];
  const waitlist = [
    { email: 'cy@example.com', joined: '2026-11-09T10:00:00.000Z', referrals: 2, activated: null as string | null },
    { email: 'di@example.com', joined: '2026-11-09T11:00:00.000Z', referrals: 0, activated: '2026-11-10T09:00:00.000Z' },
  ];
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
      ...(options.brands ? { addBrand: async (person: string, name: string) => { added.push([person, name]); return 'cfo-kit-0a1b2c'; } } : {}),
      ...(options.owner ? {
        waitlist: {
          owner: options.owner,
          list: async () => { if (options.down) throw new Error('404'); return waitlist; },
          activate: async (email: string) => {
            if (options.down) throw new Error('404');
            const entry = waitlist.find((w) => w.email === email);
            if (!entry) return { found: false, sent: false };
            activated.push(email);
            return { found: true, sent: true };
          },
        },
      } : {}),
    },
  });
  const get = (path: string, cookie?: string) => handle(new Request(`${APP}${path}`, cookie ? { headers: { cookie } } : {}));
  const post = (path: string, form: Record<string, string>, cookie: string, origin = APP) => handle(new Request(`${APP}${path}`, {
    method: 'POST', body: new URLSearchParams(form), headers: { cookie, origin, 'content-type': 'application/x-www-form-urlencoded' },
  }));
  return { handle, get, post, exchanged, added, activated };
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

test('any user of a brand adds another, from the account page\'s own form only', async () => {
  const { get, post, added } = await server({ brands: true });
  assert.match(await (await get('/', session('ada-token'))).text(), /<form method="post" action="\/brands">/);
  const made = await post('/brands', { name: 'CFO Kit' }, session('ada-token'));
  assert.equal(made.status, 303);
  assert.equal(made.headers.get('location'), '/?brand=added');
  assert.deepEqual(added, [['ada', 'CFO Kit']]);
  assert.match(await (await get('/?brand=added', session('ada-token'))).text(), /Your new brand is ready/);
  assert.equal((await post('/brands', { name: 'CFO Kit' }, session('ada-token'), 'https://evil.example')).status, 403);
  assert.equal((await post('/brands', { name: '<script>' }, session('ada-token'))).headers.get('location'), '/?brand=invalid');
  assert.equal((await post('/brands', { name: 'CFO Kit' }, session('bob-token'))).status, 403, 'not a user of this brand');
  assert.equal((await post('/brands', { name: 'CFO Kit' }, session('new-token'))).status, 404, 'no brand yet, so nothing to add from');
  assert.equal(added.length, 1);
});

test('the brand that owns the waitlist lists it, ranked, and activates people one by one', async () => {
  const { get, post, activated } = await server({ owner: 'acme' });
  const html = await (await get('/', session('ada-token'))).text();
  assert.match(html, /<h2>Beta waitlist<\/h2>/);
  assert.match(html, /cy@example\.com, joined 2026-11-09, 2 referrals: <form method="post" action="\/waitlist\/activate"><input type="hidden" name="email" value="cy@example\.com">/);
  assert.match(html, /di@example\.com, joined 2026-11-09, 0 referrals: activated 2026-11-10/);
  const done = await post('/waitlist/activate', { email: 'cy@example.com' }, session('ada-token'));
  assert.equal(done.status, 303);
  assert.equal(done.headers.get('location'), '/?activated=sent');
  assert.deepEqual(activated, ['cy@example.com']);
  assert.equal((await post('/waitlist/activate', { email: 'zed@example.com' }, session('ada-token'))).headers.get('location'), '/?activated=missing');
  assert.equal((await post('/waitlist/activate', { email: 'cy@example.com' }, session('ada-token'), 'https://evil.example')).status, 403);
});

test('any other brand sees no waitlist and cannot activate anyone', async () => {
  const { get, post, activated } = await server({ owner: 'cmokit' });
  assert.doesNotMatch(await (await get('/', session('ada-token'))).text(), /Beta waitlist/);
  assert.equal((await post('/waitlist/activate', { email: 'cy@example.com' }, session('ada-token'))).status, 404);
  assert.deepEqual(activated, []);
});

test('when the site\'s lifecycle cannot answer, the owner\'s page still shows and says so', async () => {
  const { get, post } = await server({ owner: 'acme', down: true });
  const page = await get('/', session('ada-token'));
  assert.equal(page.status, 200);
  assert.match(await page.text(), /The waitlist can't be read yet/);
  assert.equal((await post('/waitlist/activate', { email: 'cy@example.com' }, session('ada-token'))).headers.get('location'), '/?activated=failed');
});
