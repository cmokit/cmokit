import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createContentServer, type Tokens } from '../src/index.ts';
import { portalScript } from '../src/pages.ts';
import { newCustomer, portal, readyCustomer } from './fixtures.ts';

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

async function server(options: { terms?: boolean; brands?: boolean; cmokit?: string; brandsOf?: Record<string, string[]> } = {}) {
  const acme = await readyCustomer();
  const exchanged: URLSearchParams[] = [];
  const added: [string, string][] = [];
  const renamed: [string, string, string][] = [];
  const names: Record<string, string> = { 'cfo-kit-0a1b2c': 'CFO Kit' };
  const handle = createContentServer({
    issuer: ISSUER, audience: ORIGIN, tokens, portal,
    customer: (slug) => (slug === 'acme' ? acme.customer : newCustomer().customer),
    customersOf: async (person) => options.brandsOf?.[person] ?? [],
    ...(options.terms ? { terms: { url: 'https://example.com/terms', version: '2026-11-08' } } : {}),
    account: {
      origin: APP,
      exchange: async (form) => {
        exchanged.push(form);
        return form.get('code') === 'good-code' ? { access_token: 'ada-token', expires_in: 3600 } : undefined;
      },
      email: async (person) => (person === 'ada' ? 'ada@example.com' : null),
      ...(options.brands ? {
        addBrand: async (person: string, name: string) => { added.push([person, name]); return 'cfo-kit-0a1b2c'; },
        brands: async (person: string) => (options.brandsOf?.[person] ?? ['acme']).map((slug) => ({ slug, name: names[slug] ?? null })),
        renameBrand: async (person: string, slug: string, name: string) => { renamed.push([person, slug, name]); names[slug] = name; },
      } : {}),
      ...(options.cmokit ? { cmokitWaitlist: options.cmokit } : {}),
    },
  });
  const get = (path: string, cookie?: string) => handle(new Request(`${APP}${path}`, cookie ? { headers: { cookie } } : {}));
  const post = (path: string, form: Record<string, string>, cookie: string, origin = APP) => handle(new Request(`${APP}${path}`, {
    method: 'POST', body: new URLSearchParams(form), headers: { cookie, origin, 'content-type': 'application/x-www-form-urlencoded' },
  }));
  return { handle, get, post, exchanged, added, renamed, acme: acme.customer };
}

const session = (token: string) => `__Host-cmokit-session=${token}`;

/** A page's words as a person reads them: no tags, React's text separators or entities, one space between words. */
const words = (html: string) => html.replace(/<script[^>]*>.*?<\/script>/gs, '').replace(/<style>.*?<\/style>/gs, '').replace(/<!-- -->/g, '').replace(/<[^>]+>/g, ' ')
  .replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
  .replace(/\s+/g, ' ').trim();

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

test('Home shows the brand, its brand context and connections, and changes none of them; Account shows who is signed in', async () => {
  const { get } = await server({ terms: true });
  const page = await get('/', session('ada-token'));
  assert.equal(page.status, 200);
  const html = await page.text();
  assert.match(await (await get('/account', session('ada-token'))).text(), /ada@example\.com/);
  assert.match(html, /A breakfast for founders\./);
  assert.match(html, /Table/);
  assert.match(html, /not accepted .*the beta terms/);
  assert.match(html, /\/customers\/acme\/terms\?t=/);
  assert.match(html, /ask Claude/);
  assert.doesNotMatch(html, /<form/, 'Home changes nothing');
});

test('the page is three tabs at paths of their own, with a tab bar that marks the one shown', async () => {
  const { get } = await server();
  for (const [path, label] of [['/', 'Home'], ['/waitlist', 'Waitlist'], ['/account', 'Account']]) {
    const html = await (await get(path, session('ada-token'))).text();
    const nav = html.match(/<nav aria-label="Account".*?<\/nav>/)?.[0] ?? '';
    assert.deepEqual([...nav.matchAll(/<a href="([^"]+)"/g)].map((m) => m[1]), ['/', '/waitlist', '/account'], path);
    assert.match(nav, new RegExp(`aria-current="page"[^>]*>${label}<`), path);
    assert.equal((html.match(/aria-current="page"/g) ?? []).length, 1, path);
  }
  assert.doesNotMatch(await (await get('/', session('new-token'))).text(), /<nav aria-label="Account"/, 'no tabs before there is a brand');
});

test('without a valid session, the page and the export send the person to sign in', async () => {
  const { get } = await server();
  for (const cookie of [undefined, session('forged'), session('other-audience')]) {
    for (const path of ['/', '/waitlist', '/account', '/export']) {
      const response = await get(path, cookie);
      assert.equal(response.status, 302, `${path} ${cookie}`);
      assert.equal(response.headers.get('location'), '/signin');
    }
  }
});

test('a person who is not a user of the customer is refused, and one nobody activated is told so, with the way to the waitlist', async () => {
  const { get, acme } = await server({ cmokit: 'acme' });
  assert.equal((await get('/', session('bob-token'))).status, 403);
  assert.equal((await get('/export', session('bob-token'))).status, 403);
  const empty = await get('/', session('new-token'));
  assert.equal(empty.status, 200);
  const before = await empty.text();
  assert.match(before, /<h1[^>]*>You&#x27;re not activated yet<\/h1>/);
  assert.doesNotMatch(before, />Join the waitlist</, 'no link while CMO Kit lists no site');
  await acme.waitlistSetSites(['https://cmokit.example']);
  assert.match(await (await get('/', session('new-token'))).text(), /<a href="https:\/\/cmokit\.example"[^>]*>Join the waitlist<\/a>/);
  assert.equal((await get('/export', session('new-token'))).status, 404);
});

test('Home leads a new brand through setup, marking each step done from what the server holds', async () => {
  const { get, post, acme } = await server({ brands: true });
  const step = async () => (await (await get('/', session('ada-token'))).text());

  // An unnamed brand is named first, on Home, and naming it returns there.
  let html = await step();
  assert.match(words(html), /Setup: step 2 of 7/);
  assert.match(html, /<form[^>]* action="\/brands\/name" method="post"><input type="hidden" name="from" value="home"\/>/);
  assert.match(words(html), /1\. Sign in Done 2\. Name your brand Next 3\. Add CMO Kit to Claude Desktop Later/);
  const named = await post('/brands/name', { name: 'Acme Breakfasts', from: 'home' }, session('ada-token'));
  assert.equal(named.status, 303);
  assert.equal(named.headers.get('location'), '/?brand=named');
  assert.equal((await post('/brands/name', { name: '!', from: 'home' }, session('ada-token'))).headers.get('location'), '/?brand=invalid');

  // Then Claude Desktop, with the steps to email to oneself, until the person's Claude connects.
  html = await step();
  assert.match(words(html), /Setup: step 3 of 7/);
  assert.match(html, /Finish setup on a computer/);
  assert.match(html, /href="mailto:ada%40example\.com\?subject=Set%20up%20CMO%20Kit/);
  assert.match(words(html), /3\. Add CMO Kit to Claude Desktop Next 4\. Sign in from Claude Next/);
  // The address Claude connects to is on the page to copy, and in the emailed steps.
  assert.match(html, /<code[^>]*>https:\/\/mcp\.example<\/code>/);
  assert.match(html, />Copy the address</);
  assert.match(words(html), /pick Acme Breakfasts at "Which brand\?"/);
  assert.match(html, /address%20in%20Claude%3A%20https%3A%2F%2Fmcp\.example%0A/);
  await acme.claudeSeen('ada');

  // The brand context is already approved, so measuring the page is next, done once a visit is counted.
  html = await step();
  assert.match(words(html), /Setup: step 6 of 7 Measure your page/);
  assert.match(html, /<a href="\/waitlist"[^>]*>Go to the Waitlist tab<\/a>/);
  await acme.funnelVisit('https://brand.example/', {});

  // Then the first Reel, and setup ends once one is planned.
  html = await step();
  assert.match(words(html), /Setup: step 7 of 7 Plan your first Reel/);
  await acme.pieceSave('ada', { signal: 'planned', week: '2026-W47', offer: 'table', format: 'teaser', kind: 'reel', destination: 'https://luma.com/table-nov' });
  html = await step();
  assert.doesNotMatch(html, /Setup: step/);
  assert.doesNotMatch(html, /<form/, 'a set-up Home changes nothing');
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
  const page = await (await get('/account', session('ada-token'))).text();
  assert.match(page, /<form[^>]* action="\/brands" method="post">/);
  // Under no-referrer, Safari sends the form's Origin as "null" and every change would be refused.
  assert.match(page, /<meta name="referrer" content="same-origin">/);
  const made = await post('/brands', { name: 'CFO Kit' }, session('ada-token'));
  assert.equal(made.status, 303);
  assert.equal(made.headers.get('location'), '/account?brand=added');
  assert.deepEqual(added, [['ada', 'CFO Kit']]);
  assert.match(await (await get('/account?brand=added', session('ada-token'))).text(), /Your new brand is ready/);
  const refused = await post('/brands', { name: 'CFO Kit' }, session('ada-token'), 'https://evil.example');
  assert.equal(refused.status, 403);
  assert.match(refused.headers.get('content-type') ?? '', /^text\/plain/, 'a refusal is shown, not offered as a download');
  assert.match(await refused.text(), /account page/);
  assert.equal((await post('/brands', { name: '<script>' }, session('ada-token'))).headers.get('location'), '/account?brand=invalid');
  assert.equal((await post('/brands', { name: 'CFO Kit' }, session('bob-token'))).status, 403, 'not a user of this brand');
  assert.equal((await post('/brands', { name: 'CFO Kit' }, session('new-token'))).status, 404, 'no brand yet, so nothing to add from');
  assert.equal(added.length, 1);
});

test('a brand\'s users list its sites, get the form to paste, and activate people from its ranked waitlist', async () => {
  const { get, post, handle, acme } = await server();
  let html = await (await get('/waitlist', session('ada-token'))).text();
  assert.match(html, /<h1[^>]*>Waitlist<\/h1>/);
  assert.match(words(html), /Add your site's address first/);
  assert.doesNotMatch(html, /lets them sign in and use CMOkit/, 'only CMOkit\'s own brand grants CMOkit');

  const saved = await post('/waitlist/sites', { sites: 'brand.example\nhttps://www.brand.example' }, session('ada-token'));
  assert.equal(saved.headers.get('location'), '/waitlist?sites=saved');
  assert.deepEqual(await acme.waitlistSites(), ['https://brand.example', 'https://www.brand.example']);
  assert.equal((await post('/waitlist/sites', { sites: 'http://brand.example' }, session('ada-token'))).headers.get('location'), '/waitlist?sites=invalid');
  assert.equal((await post('/waitlist/sites', { sites: 'evil.example' }, session('ada-token'), 'https://evil.example')).status, 403);

  const joined = await handle(new Request(`${APP}/join/acme`, {
    method: 'POST', body: new URLSearchParams({ email: 'cy@example.com', page: 'https://brand.example/?utm_content=reel-1' }),
    headers: { origin: 'https://brand.example', accept: 'application/json' },
  }));
  assert.equal(joined.status, 200);
  html = await (await get('/waitlist', session('ada-token'))).text();
  assert.match(html, /action=&quot;https:\/\/app\.example\/join\/acme&quot;/, 'the snippet names this brand\'s join address');
  assert.match(html, />Copy the form</, 'the form comes with a button that copies it');
  const row = html.match(/<ul aria-label="Waitlist".*?<\/ul>/)?.[0] ?? '';
  assert.match(words(row), /^cy@example\.com joined \d{4}-\d{2}-\d{2}, 0 referrals, came from utm_content=reel-1 Activate$/);
  assert.match(row, /<form action="\/waitlist\/activate" method="post"><input type="hidden" name="email" value="cy@example\.com"\/>/);

  const done = await post('/waitlist/activate', { email: 'cy@example.com' }, session('ada-token'));
  assert.equal(done.status, 303);
  assert.equal(done.headers.get('location'), '/waitlist?activated=done');
  assert.ok((await acme.waitlistList())[0].activated);
  assert.match(await (await get('/waitlist?activated=done', session('ada-token'))).text(), /CMOkit sends no email yet/);
  assert.equal((await post('/waitlist/activate', { email: 'zed@example.com' }, session('ada-token'))).headers.get('location'), '/waitlist?activated=missing');
  assert.equal((await post('/waitlist/activate', { email: 'cy@example.com' }, session('bob-token'))).status, 403, 'not a user of this brand');

  await handle(new Request(`${APP}/join/acme`, {
    method: 'POST', body: new URLSearchParams({ email: 'di@example.com' }), headers: { origin: 'https://brand.example', accept: 'application/json' },
  }));
  await acme.waitlistDecline('di@example.com');
  assert.match(words(await (await get('/waitlist', session('ada-token'))).text()), /di@example\.com joined \d{4}-\d{2}-\d{2}, 0 referrals Declined \d{4}-\d{2}-\d{2}/);
  assert.equal((await post('/waitlist/activate', { email: 'di@example.com' }, session('ada-token'))).headers.get('location'), '/waitlist?activated=declined');
  assert.equal((await acme.waitlistList()).find((p) => p.email === 'di@example.com')!.activated, null);
});

test('on CMOkit\'s own brand, the page says activating someone lets them use CMOkit', async () => {
  const { get } = await server({ cmokit: 'acme' });
  assert.match(await (await get('/waitlist', session('ada-token'))).text(), /Activating someone here lets them sign in and use CMOkit/);
});

test('the account page lists every brand of the person by name, and a sign-in that chose none signs in again to choose', async () => {
  const { get, post, renamed } = await server({ brands: true, brandsOf: { ada: ['acme', 'cfo-kit-0a1b2c'], new: ['acme', 'cfo-kit-0a1b2c'] } });
  const page = await (await get('/account?brand=added', session('ada-token'))).text();
  assert.match(words(page), /Brand: Unnamed brand\./, 'a brand never named, such as the first one made at activation');
  assert.match(page, /<li>Unnamed brand<!-- --> \(shown on this page\)<\/li><li>CFO Kit<\/li>/);
  assert.doesNotMatch(words(page), /cfo-kit-0a1b2c/, 'brands are shown by name, not by code');
  assert.match(page, /<a href="\/signin"[^>]*>Switch brand<\/a>/);
  assert.match(page, /listed under Brands/);
  // Naming the brand the page shows.
  assert.match(page, /<form[^>]* action="\/brands\/name" method="post">/);
  const named = await post('/brands/name', { name: 'CMO Kit' }, session('ada-token'));
  assert.equal(named.headers.get('location'), '/account?brand=renamed');
  assert.deepEqual(renamed, [['ada', 'acme', 'CMO Kit']]);
  assert.match(words(await (await get('/account?brand=renamed', session('ada-token'))).text()), /Brand: CMO Kit\./);
  assert.equal((await post('/brands/name', { name: '<b>' }, session('ada-token'))).headers.get('location'), '/account?brand=invalid');
  assert.equal((await post('/brands/name', { name: 'CMO Kit' }, session('ada-token'), 'https://evil.example')).status, 403);
  assert.equal(renamed.length, 1);
  // A session from before the second brand names no brand: the page asks again rather than refusing.
  const again = await get('/', session('new-token'));
  assert.equal(again.status, 303);
  assert.equal(again.headers.get('location'), '/signin');
});

test('the account page\'s script is served from its own origin, cached for good at its versioned address', async () => {
  const { get } = await server();
  const versioned = await get(portalScript(portal));
  assert.equal(versioned.status, 200);
  assert.equal(versioned.headers.get('content-type'), 'text/javascript; charset=utf-8');
  assert.equal(versioned.headers.get('cache-control'), 'public, max-age=31536000, immutable');
  assert.equal(await versioned.text(), portal.script);
  assert.equal((await get('/portal.js?v=old')).headers.get('cache-control'), 'no-cache', 'an older address is not cached for good');
});
