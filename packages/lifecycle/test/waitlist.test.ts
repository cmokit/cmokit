import assert from 'node:assert/strict';
import { test } from 'node:test';
import { referralCode, resolve } from '@cmokit/cli';
import { Waitlist, createLifecycle, type Leads, type WaitlistCalls } from '../src/index.ts';
import { CONFIG, TEMPLATES, analyticsStandIn, messagingStandIn, sqlite } from './fixtures.ts';

const T0 = 1_800_000_000_000;
const KEY = 'maintainer-key';

const config = resolve({
  ...CONFIG,
  waitlist: { event: 'waitlist_joined', template: 'in', link: 'https://app.site.example/start' },
});
const templates = { ...TEMPLATES, in: '---\nsubject: You are in\n---\nStart here: [your account]({{link}}).' };

function setup(options: { sending?: boolean; waitlistKey?: string } = {}) {
  const m = messagingStandIn();
  const a = analyticsStandIn();
  const list = new Waitlist(sqlite(), () => 'wtok');
  let now = T0;
  const waitlist: WaitlistCalls = {
    join: async (joining) => list.join(joining, now++),
    list: async () => list.list(),
    activate: async (email) => {
      const activated = list.activate(email, now);
      return { found: list.has(email), ...(activated ? { activated } : {}) };
    },
    isActivated: async (email) => list.isActivated(email),
    unsubscribe: async (key, token) => list.unsubscribe(key, token),
  };
  const started: string[] = [];
  const leads: Leads = {
    start: async (capture) => void started.push(`${capture.sequence}:${capture.key}`),
    stop: async () => undefined,
    unsubscribe: async () => undefined,
  };
  const handle = createLifecycle({
    config, leads, messaging: m.messaging, analytics: a.analytics, templates, waitlist,
    waitlistKey: options.waitlistKey ?? KEY, sending: options.sending ?? true,
  });
  const call = (path: string, init: RequestInit = {}) => handle(new Request(`https://site.example${path}`, init));
  const join = (key: string, email: string, ref?: string) => call('/internal/lead', {
    method: 'POST',
    body: JSON.stringify({ key, email, visitor: `v-${key}`, event: 'waitlist_joined', origin: 'https://site.example/join', properties: ref ? { ref } : {} }),
  });
  const auth = { authorization: `Bearer ${KEY}` };
  return { list, call, join, auth, started, ...m, ...a };
}

test('the waitlist ranks people by how many joined through their link, then by who joined first', async () => {
  const w = setup();
  assert.equal((await w.join('k1', 'ada@example.com')).status, 204);
  const ada = await referralCode('k1');
  await w.join('k2', 'bo@example.com');
  await w.join('k3', 'cy@example.com', ada);
  await w.join('k4', 'di@example.com', ada);
  await w.join('k5', 'ed@example.com', await referralCode('k2'));
  await w.join('k1', 'ada@example.com', 'someone-else');
  const response = await w.call('/_cmokit/waitlist', { headers: w.auth });
  const { waitlist } = await response.json() as { waitlist: { email: string; referrals: number; referredBy: string | null }[] };
  assert.deepEqual(waitlist.map((p) => [p.email, p.referrals]), [
    ['ada@example.com', 2], ['bo@example.com', 1], ['cy@example.com', 0], ['di@example.com', 0], ['ed@example.com', 0],
  ]);
  assert.equal(waitlist[0].referredBy, null, 'joining again changes nothing');
});

test('a person cannot refer themselves', async () => {
  const w = setup();
  await w.join('k1', 'ada@example.com', await referralCode('k1'));
  assert.equal(w.list.list()[0].referredBy, null);
});

test('reading or activating the waitlist needs the waitlist key', async () => {
  const w = setup();
  assert.equal((await w.call('/_cmokit/waitlist')).status, 401);
  assert.equal((await w.call('/_cmokit/waitlist', { headers: { authorization: 'Bearer wrong' } })).status, 401);
  const post = { method: 'POST', body: JSON.stringify({ email: 'ada@example.com' }) };
  assert.equal((await w.call('/_cmokit/waitlist/activate', post)).status, 401);
  const unset = setup({ waitlistKey: '' });
  assert.equal((await unset.call('/_cmokit/waitlist', { headers: { authorization: 'Bearer ' } })).status, 404);
});

test('activating sends the activation message once, with the configured link', async () => {
  const w = setup();
  await w.join('k1', 'Ada@Example.com');
  const activate = () => w.call('/_cmokit/waitlist/activate', { method: 'POST', headers: w.auth, body: JSON.stringify({ email: 'ada@example.com' }) });
  assert.deepEqual(await (await activate()).json(), { email: 'ada@example.com', activated: true, sent: true });
  assert.deepEqual(await (await activate()).json(), { email: 'ada@example.com', activated: true, sent: false });
  assert.equal(w.sent.length, 1);
  assert.equal(w.sent[0].to, 'Ada@Example.com');
  assert.equal(w.sent[0].subject, 'You are in');
  assert.match(w.sent[0].text, /https:\/\/app\.site\.example\/start/);
  assert.equal(w.sent[0].unsubscribeUrl, 'https://site.example/_cmokit/leads/unsubscribe?s=waitlist&l=k1&t=wtok');
  assert.equal(w.sent[0].tags.cmokit_sequence, 'waitlist');
  assert.equal(w.events.at(-1)?.name, 'waitlist_activated');
  const missing = await w.call('/_cmokit/waitlist/activate', { method: 'POST', headers: w.auth, body: JSON.stringify({ email: 'zed@example.com' }) });
  assert.equal(missing.status, 404);
});

test('a product\'s account page lists the waitlist and activates people over its binding, with no key', async () => {
  const w = setup({ waitlistKey: '' });
  await w.join('k1', 'ada@example.com');
  await w.join('k2', 'bo@example.com', await referralCode('k1'));
  const listed = await w.call('/internal/waitlist', { method: 'POST', body: '{}' });
  const { waitlist } = await listed.json() as { waitlist: { email: string; referrals: number; activated: string | null }[] };
  assert.deepEqual(waitlist.map((p) => [p.email, p.referrals, p.activated]), [['ada@example.com', 1, null], ['bo@example.com', 0, null]]);
  const activate = (email: string) => w.call('/internal/activate', { method: 'POST', body: JSON.stringify({ email }) });
  assert.deepEqual(await (await activate('ada@example.com')).json(), { email: 'ada@example.com', activated: true, sent: true });
  assert.deepEqual(await (await activate('ada@example.com')).json(), { email: 'ada@example.com', activated: true, sent: false });
  assert.equal(w.sent.length, 1);
  assert.equal((await activate('zed@example.com')).status, 404);
  assert.equal((await w.call('/internal/waitlist')).status, 404, 'only a POST, as a product makes it');
});

test('a product asks whether an address is activated, in any case', async () => {
  const w = setup();
  await w.join('k1', 'ada@example.com');
  const ask = async (email: string) => (await (await w.call('/internal/activated', { method: 'POST', body: JSON.stringify({ email }) })).json() as { activated: boolean }).activated;
  assert.equal(await ask('ada@example.com'), false);
  w.list.activate('ada@example.com', T0);
  assert.equal(await ask('ADA@example.com'), true);
  assert.equal(await ask('bo@example.com'), false);
});

test('without a sending key, people still join the waitlist and are activated, and are told by the maintainer', async () => {
  const w = setup({ sending: false });
  assert.equal((await w.join('k1', 'ada@example.com')).status, 204);
  const answer = await (await w.call('/_cmokit/waitlist/activate', { method: 'POST', headers: w.auth, body: JSON.stringify({ email: 'ada@example.com' }) })).json();
  assert.deepEqual(answer, { email: 'ada@example.com', activated: true, sent: false });
  assert.equal(w.sent.length, 0);
});

test('the activation message\'s unsubscribe link stops it and suppresses the address', async () => {
  const w = setup();
  await w.join('k1', 'ada@example.com');
  const bad = await w.call('/_cmokit/leads/unsubscribe?s=waitlist&l=k1&t=nope', { method: 'POST' });
  assert.equal(bad.status, 400);
  const good = await w.call('/_cmokit/leads/unsubscribe?s=waitlist&l=k1&t=wtok', { method: 'POST' });
  assert.equal(good.status, 200);
  assert.deepEqual(w.suppressed, ['42:ada@example.com']);
  w.list.activate('ada@example.com', T0);
  assert.equal(w.list.isActivated('ada@example.com'), true, 'an unsubscribed person can still be activated, with no message');
});
