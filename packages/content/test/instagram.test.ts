import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Customer, aesGcmVault, createContentServer, instagramApp, type InstagramApp, type ReelComment, type Tokens } from '../src/index.ts';
import { KEY, T0, eventsStandIn, sqlite } from './fixtures.ts';

const APP = 'https://app.example';
const SITE = 'https://brand.example';
const tokens: Tokens = { check: async (token) => (token === 'ada-token' ? { person: 'ada', audience: 'https://mcp.example', customer: 'acme' } : undefined) };

/** A Meta that knows the brand's account by its code, and the comments on the brand's Reels. */
function fakeInstagram() {
  const comments: ReelComment[] = [];
  const read: string[] = [];
  const app: InstagramApp = {
    loginUrl: (state) => `https://www.facebook.com/dialog/oauth?config_id=cfg&state=${encodeURIComponent(state)}`,
    async connect(code) {
      if (code !== 'brand-code') throw Object.assign(new Error('Invalid code'), { name: 'InstagramError' });
      return { token: 'portfolio-token', id: '999', username: 'acmebrand' };
    },
    reelComments: async (token, account) => { read.push(`${token} ${account}`); return { reels: 3, comments: [...comments] }; },
  };
  return { app, comments, read };
}

function setup(withApp = true) {
  let now = T0;
  const { app, comments, read } = fakeInstagram();
  const customer = new Customer(sqlite(), { vault: aesGcmVault(KEY), events: eventsStandIn().events, instagram: app, now: () => now });
  const handle = createContentServer({
    issuer: 'https://auth.example', audience: 'https://mcp.example', tokens,
    customer: () => customer,
    account: { origin: APP, exchange: async () => undefined, email: async () => 'ada@example.com' },
    ...(withApp ? { instagram: app } : {}),
  });
  const join = async (fields: Record<string, string>) => (await handle(new Request(`${APP}/join/acme`, {
    method: 'POST', body: new URLSearchParams(fields), headers: { origin: SITE, accept: 'application/json' },
  }))).json() as Promise<{ referral: string; place: number; instagram?: { account: string; code: string } }>;
  const back = (login: string, code: string | null) => {
    const callback = new URL(`${APP}/instagram/callback`);
    callback.searchParams.set('state', new URL(login).searchParams.get('state')!);
    if (code) callback.searchParams.set('code', code);
    return handle(new Request(callback));
  };
  const post = (path: string) => handle(new Request(`${APP}${path}`, {
    method: 'POST', body: new URLSearchParams(), headers: { cookie: '__Host-cmokit-session=ada-token', origin: APP, 'content-type': 'application/x-www-form-urlencoded' },
  }));
  const connectBrand = async () => back((await post('/instagram/connect')).headers.get('location')!, 'brand-code');
  return { customer, handle, join, back, post, connectBrand, comments, read, later: (ms: number) => { now += ms; } };
}

test('the brand connects its Instagram through Meta\'s login, and its account and token are kept', async () => {
  const { post, back, customer, read } = setup();
  await customer.addUser('ada');
  assert.equal((await post('/instagram/count')).headers.get('location'), '/?instagram=failed', 'nothing to count before the brand connects');
  const started = await post('/instagram/connect');
  assert.equal(started.status, 303);
  const login = new URL(started.headers.get('location')!);
  assert.equal(`${login.origin}${login.pathname}`, 'https://www.facebook.com/dialog/oauth');
  assert.match(login.searchParams.get('state')!, /^acme\.[A-Za-z0-9_-]{32}$/);
  assert.equal((await back(login.toString(), 'brand-code')).headers.get('location'), `${APP}/?instagram=connected`);
  assert.equal((await back(login.toString(), 'brand-code')).status, 410, 'a start is used once');
  assert.equal((await customer.instagramAccount())!.username, 'acmebrand');
  assert.equal((await post('/instagram/count')).headers.get('location'), '/?instagram=counted');
  assert.deepEqual(read, ['portfolio-token 999'], 'the brand\'s own account is read with the kept token');
});

test('Meta saying no sends the brand back to its account page, and an unknown start is gone', async () => {
  const { post, back, customer } = setup();
  await customer.addUser('ada');
  assert.equal((await back((await post('/instagram/connect')).headers.get('location')!, null)).headers.get('location'), `${APP}/?instagram=failed`);
  assert.equal((await back((await post('/instagram/connect')).headers.get('location')!, 'not-a-code')).headers.get('location'), `${APP}/?instagram=failed`);
  assert.equal((await back('https://www.facebook.com/dialog/oauth?state=acme.' + 'x'.repeat(32), 'brand-code')).status, 410);
  assert.equal(await customer.instagramAccount(), null);
});

test('once the brand connected, joining answers with its account and the person\'s code to comment', async () => {
  const { join, customer, connectBrand } = setup();
  await customer.addUser('ada');
  await customer.waitlistSetSites([SITE]);
  assert.equal((await join({ email: 'di@example.com' })).instagram, undefined, 'no Instagram step before the brand connects');
  await connectBrand();
  const cy = await join({ email: 'cy@example.com' });
  assert.deepEqual(cy.instagram, { account: 'acmebrand', code: new URL(cy.referral).searchParams.get('ref') });
});

test('with no Instagram app set up, joining offers no Instagram step even if an account was kept', async () => {
  const { join, customer } = setup(false);
  await customer.waitlistSetSites([SITE]);
  await customer.instagramSave('ada', '999', 'acmebrand', 'token');
  assert.equal((await join({ email: 'cy@example.com' })).instagram, undefined);
});

test('commenting a code proves the handle, and each Reel that handle commented on moves the person up', async () => {
  const { join, customer, connectBrand, comments, post, later } = setup();
  await customer.addUser('ada');
  await customer.waitlistSetSites([SITE]);
  await connectBrand();
  await join({ email: 'di@example.com' });
  later(1000);
  const cy = await join({ email: 'cy@example.com' });
  assert.equal(cy.place, 2);
  comments.push(
    { reel: 'r1', username: 'cy.makes', text: `Joining! ${cy.instagram!.code}` },
    { reel: 'r2', username: 'cy.makes', text: 'Love this' },
    { reel: 'r1', username: 'stranger', text: 'nice' },
  );
  assert.equal((await post('/instagram/count')).headers.get('location'), '/?instagram=counted');
  assert.deepEqual((await customer.waitlistList()).map((p) => [p.email, p.instagram, p.engaged]), [['cy@example.com', 'cy.makes', 2], ['di@example.com', null, 0]]);
  assert.deepEqual((await customer.instagramAccount())!.counted, { at: new Date(T0 + 1000).toISOString(), reels: 3, people: 1 });
  assert.equal((await join({ email: 'cy@example.com' })).place, 1, 'commenting on two Reels moved them ahead');
});

test('the first proof stands: a handle already tied, or a person already tied, does not move', async () => {
  const { customer, connectBrand, comments } = setup();
  await customer.addUser('ada');
  await connectBrand();
  const a = await customer.waitlistJoin('a@example.com');
  const b = await customer.waitlistJoin('b@example.com');
  comments.push({ reel: 'r1', username: 'cy.makes', text: a.code });
  await customer.instagramCount();
  comments.push({ reel: 'r2', username: 'cy.makes', text: b.code }, { reel: 'r2', username: 'someone', text: a.code });
  await customer.instagramCount();
  assert.deepEqual((await customer.waitlistList()).map((p) => [p.email, p.instagram, p.engaged]), [['a@example.com', 'cy.makes', 2], ['b@example.com', null, 0]]);
});

test('the Instagram client logs in with the configuration, trades the code on the Graph API, and reads Reel comments', async () => {
  const asked: string[] = [];
  const answers: Record<string, unknown> = {
    'https://graph.facebook.com/v27.0/oauth/access_token': { access_token: 'portfolio', token_type: 'bearer' },
    'https://graph.facebook.com/v27.0/me/assigned_instagram_accounts': { data: [{ id: '17841', username: 'AcmeBrand' }] },
    'https://graph.facebook.com/v27.0/17841/media': { data: [{ id: 'r1', media_product_type: 'REELS' }, { id: 'p1', media_product_type: 'FEED' }, { id: 'r2', media_product_type: 'REELS' }] },
    'https://graph.facebook.com/v27.0/r1/comments': { data: [{ username: 'A', text: 'code1' }, { username: 'b' }] },
    'https://graph.facebook.com/v27.0/r2/comments': { data: [{ username: 'a', text: 'again' }] },
  };
  const app = instagramApp({
    appId: 'app', appSecret: 'secret', configId: 'cfg', redirectUri: `${APP}/instagram/callback`,
    fetch: (async (input: string) => {
      const url = new URL(input);
      asked.push(input);
      const answer = answers[`${url.origin}${url.pathname}`];
      return Response.json(answer ?? { error: { message: 'unknown' } }, { status: answer ? 200 : 400 });
    }) as typeof fetch,
  });
  const login = new URL(app.loginUrl('acme.state'));
  assert.equal(`${login.origin}${login.pathname}`, 'https://www.facebook.com/dialog/oauth');
  assert.equal(login.searchParams.get('client_id'), 'app');
  assert.equal(login.searchParams.get('config_id'), 'cfg');
  assert.equal(login.searchParams.get('redirect_uri'), `${APP}/instagram/callback`);
  assert.equal(login.searchParams.get('response_type'), 'code');
  assert.equal(login.searchParams.get('state'), 'acme.state');

  assert.deepEqual(await app.connect('the-code'), { token: 'portfolio', id: '17841', username: 'acmebrand' });
  const exchange = new URL(asked[0]);
  assert.equal(exchange.searchParams.get('code'), 'the-code');
  assert.equal(exchange.searchParams.get('client_secret'), 'secret');
  assert.equal(exchange.searchParams.get('redirect_uri'), `${APP}/instagram/callback`);
  assert.deepEqual(await app.reelComments('portfolio', '17841'), {
    reels: 2, comments: [{ reel: 'r1', username: 'a', text: 'code1' }, { reel: 'r1', username: 'b', text: '' }, { reel: 'r2', username: 'a', text: 'again' }],
  });
  await assert.rejects(app.reelComments('portfolio', 'nobody'), { name: 'InstagramError' });
});
