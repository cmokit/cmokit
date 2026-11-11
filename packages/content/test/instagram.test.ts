import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Customer, aesGcmVault, createContentServer, instagramApp, type InstagramApp, type Tokens } from '../src/index.ts';
import { BRAND_SCOPES, MEMBER_SCOPES } from '../src/instagram.ts';
import { KEY, T0, eventsStandIn, sqlite } from './fixtures.ts';

const APP = 'https://app.example';
const SITE = 'https://brand.example';
const tokens: Tokens = { check: async (token) => (token === 'ada-token' ? { person: 'ada', audience: 'https://mcp.example', customer: 'acme' } : undefined) };

/** An Instagram that knows two accounts by their codes, and the brand's Reels and who commented on them. */
function fakeInstagram() {
  const accounts: Record<string, { id: string; username: string }> = {
    'cy-code': { id: '111', username: 'cy.makes' },
    'brand-code': { id: '999', username: 'acmebrand' },
  };
  const refreshed: string[] = [];
  const app: InstagramApp = {
    authorizeUrl: (state, scopes) => `https://www.instagram.com/oauth/authorize?state=${encodeURIComponent(state)}&scope=${scopes.join(',')}`,
    async connect(code) {
      const account = accounts[code];
      if (!account) throw Object.assign(new Error('Invalid code'), { name: 'InstagramError' });
      return { token: `short-${code}`, ...account };
    },
    longLived: async (token) => ({ token: `long-${token}`, expiresIn: 5_184_000 }),
    refresh: async (token) => { refreshed.push(token); return { token: `${token}-r`, expiresIn: 5_184_000 }; },
    reelCommenters: async () => ({
      reels: 3,
      commenters: [{ reel: 'r1', username: 'cy.makes' }, { reel: 'r2', username: 'cy.makes' }, { reel: 'r1', username: 'stranger' }],
    }),
  };
  return { app, refreshed };
}

function setup() {
  let now = T0;
  const { app, refreshed } = fakeInstagram();
  const customer = new Customer(sqlite(), { vault: aesGcmVault(KEY), events: eventsStandIn().events, instagram: app, now: () => now });
  const handle = createContentServer({
    issuer: 'https://auth.example', audience: 'https://mcp.example', tokens,
    customer: () => customer,
    account: { origin: APP, exchange: async () => undefined, email: async () => 'ada@example.com' },
    instagram: app,
  });
  const join = async (fields: Record<string, string>) => (await handle(new Request(`${APP}/join/acme`, {
    method: 'POST', body: new URLSearchParams(fields), headers: { origin: SITE, accept: 'application/json' },
  }))).json() as Promise<{ referral: string; place: number; instagram?: string }>;
  const back = (connect: string, code: string | null) => {
    const callback = new URL(`${APP}/instagram/callback`);
    callback.searchParams.set('state', new URL(connect).searchParams.get('state')!);
    if (code) callback.searchParams.set('code', `${code}#_`.replace('#_', ''));
    return handle(new Request(callback));
  };
  const post = (path: string) => handle(new Request(`${APP}${path}`, {
    method: 'POST', body: new URLSearchParams(), headers: { cookie: '__Host-cmokit-session=ada-token', origin: APP, 'content-type': 'application/x-www-form-urlencoded' },
  }));
  return { customer, handle, join, back, post, refreshed, later: (ms: number) => { now += ms; } };
}

test('a person who joined gets the address to connect Instagram, which names the brand and asks only who they are', async () => {
  const { join, customer } = setup();
  await customer.addUser('ada');
  await customer.waitlistSetSites([SITE]);
  const { instagram } = await join({ email: 'cy@example.com', page: `${SITE}/beta` });
  const connect = new URL(instagram!);
  assert.match(connect.searchParams.get('state')!, /^acme\.[A-Za-z0-9_-]{32}$/);
  assert.equal(connect.searchParams.get('scope'), MEMBER_SCOPES.join(','));
});

test('connecting Instagram proves the person\'s handle, and comments on the brand\'s Reels move them up', async () => {
  const { join, back, post, customer, refreshed, later } = setup();
  await customer.addUser('ada');
  await customer.waitlistSetSites([SITE]);
  const di = await join({ email: 'di@example.com', page: `${SITE}/` });
  later(1000);
  const cy = await join({ email: 'cy@example.com', page: `${SITE}/beta?utm_content=reel-1` });
  assert.equal(cy.place, 2);

  const connected = await back(cy.instagram!, 'cy-code');
  assert.equal(connected.status, 200);
  const page = await connected.text();
  assert.match(page, /@cy\.makes is connected, and you're number 2 on the list/);
  assert.match(page, /href="https:\/\/brand\.example\/beta\?utm_content=reel-1"/, 'back to the page they joined on');
  assert.equal((await back(cy.instagram!, 'cy-code')).status, 410, 'a start is used once');
  assert.equal((await customer.waitlistList()).find((p) => p.email === 'cy@example.com')!.instagram, 'cy.makes');

  // The brand connects its own account from the account page, and its token is kept for counting.
  assert.equal((await post('/instagram/count')).headers.get('location'), '/?instagram=failed', 'nothing to count before the brand connects');
  const started = await post('/instagram/connect');
  assert.equal(started.status, 303);
  const authorize = new URL(started.headers.get('location')!);
  assert.equal(authorize.searchParams.get('scope'), BRAND_SCOPES.join(','));
  const done = await back(authorize.toString(), 'brand-code');
  assert.equal(done.headers.get('location'), `${APP}/?instagram=connected`);
  assert.equal((await customer.instagramAccount())!.username, 'acmebrand');

  later(2 * 86_400_000);
  assert.equal((await post('/instagram/count')).headers.get('location'), '/?instagram=counted');
  assert.deepEqual(refreshed, ['long-short-brand-code'], 'a day-old token is refreshed before counting');
  assert.deepEqual((await customer.waitlistList()).map((p) => [p.email, p.engaged]), [['cy@example.com', 2], ['di@example.com', 0]]);
  assert.deepEqual((await customer.instagramAccount())!.counted, { at: new Date(T0 + 1000 + 2 * 86_400_000).toISOString(), reels: 3, people: 1 });
  assert.equal((await join({ email: 'cy@example.com' })).place, 1, 'commenting on two Reels moved them ahead');
  void di;
});

test('an account connected again from another address moves there, and its old count goes with it', async () => {
  const { customer } = setup();
  const a = await customer.waitlistJoin('a@example.com');
  const b = await customer.waitlistJoin('b@example.com');
  await customer.waitlistInstagram(a.code, '111', 'cy.makes');
  await customer.waitlistInstagram(b.code, '111', 'cy.makes');
  assert.deepEqual((await customer.waitlistList()).map((p) => [p.email, p.instagram]), [['a@example.com', null], ['b@example.com', 'cy.makes']]);
});

test('Instagram saying no, or an unknown or used start, gets a page saying what to do', async () => {
  const { join, back, customer } = setup();
  await customer.waitlistSetSites([SITE]);
  const { instagram } = await join({ email: 'cy@example.com' });
  const refused = await back(instagram!, null);
  assert.equal(refused.status, 400);
  assert.match(await refused.text(), /needs an Instagram business or creator account/);
  const second = await join({ email: 'cy@example.com' });
  assert.equal((await back(second.instagram!, 'not-a-code')).status, 400);
  const gone = await back('https://www.instagram.com/oauth/authorize?state=acme.' + 'x'.repeat(32), 'cy-code');
  assert.equal(gone.status, 410);
});

test('the Instagram client trades the code without its #_ end, reads the account, and counts each Reel once per commenter', async () => {
  const asked: { url: string; body?: string }[] = [];
  const answers: Record<string, unknown> = {
    'https://api.instagram.com/oauth/access_token': { data: [{ access_token: 'short', user_id: '1', permissions: 'instagram_business_basic' }] },
    'https://graph.instagram.com/me': { user_id: '1', username: 'Cy.Makes' },
    'https://graph.instagram.com/me/media': { data: [{ id: 'r1', media_product_type: 'REELS' }, { id: 'p1', media_product_type: 'FEED' }, { id: 'r2', media_product_type: 'REELS' }] },
    'https://graph.instagram.com/r1/comments': { data: [{ username: 'a' }, { username: 'A' }, { username: 'b' }] },
    'https://graph.instagram.com/r2/comments': { data: [{ username: 'a' }] },
  };
  const app = instagramApp({
    appId: 'app', appSecret: 'secret', redirectUri: `${APP}/instagram/callback`,
    fetch: (async (input: string, init?: RequestInit) => {
      const url = new URL(input);
      asked.push({ url: input, ...(init?.body ? { body: String(init.body) } : {}) });
      return Response.json(answers[`${url.origin}${url.pathname}`] ?? { error: { message: 'unknown' } }, { status: answers[`${url.origin}${url.pathname}`] ? 200 : 400 });
    }) as typeof fetch,
  });
  const authorize = new URL(app.authorizeUrl('acme.state', MEMBER_SCOPES));
  assert.equal(`${authorize.origin}${authorize.pathname}`, 'https://www.instagram.com/oauth/authorize');
  assert.equal(authorize.searchParams.get('redirect_uri'), `${APP}/instagram/callback`);
  assert.equal(authorize.searchParams.get('response_type'), 'code');

  assert.deepEqual(await app.connect('the-code#_'), { token: 'short', id: '1', username: 'cy.makes' });
  assert.match(asked[0].body!, /code=the-code(&|$)/);
  assert.match(asked[0].body!, /client_secret=secret/);
  assert.deepEqual(await app.reelCommenters('long'), {
    reels: 2, commenters: [{ reel: 'r1', username: 'a' }, { reel: 'r1', username: 'b' }, { reel: 'r2', username: 'a' }],
  });
  await assert.rejects(app.refresh('long'), { name: 'InstagramError' });
});
