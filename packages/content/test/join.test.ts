import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createContentServer, type Tokens } from '../src/index.ts';
import { joinSnippet } from '../src/join.ts';
import { Customer, aesGcmVault } from '../src/index.ts';
import { KEY, eventsStandIn, newCustomer, sqlite } from './fixtures.ts';

const SITE = 'https://brand.example';
const tokens: Tokens = { check: async () => undefined };

async function setup(options: { allow?: (key: string) => Promise<boolean> } = {}) {
  const made = newCustomer();
  await made.customer.addUser('ada');
  await made.customer.waitlistSetSites([SITE]);
  const handle = createContentServer({
    issuer: 'https://auth.example', audience: 'https://mcp.example', tokens,
    customer: (slug) => (slug === 'acme' ? made.customer : newCustomer().customer),
    ...(options.allow ? { join: { allow: options.allow } } : {}),
  });
  const join = (fields: Record<string, string>, init: { origin?: string | null; json?: boolean; ip?: string; slug?: string } = {}) => {
    const headers: Record<string, string> = { 'content-type': 'application/x-www-form-urlencoded' };
    if (init.origin !== null) headers.origin = init.origin ?? SITE;
    if (init.json !== false) headers.accept = 'application/json';
    if (init.ip) headers['cf-connecting-ip'] = init.ip;
    return handle(new Request(`https://app.example/join/${init.slug ?? 'acme'}`, { method: 'POST', body: new URLSearchParams(fields), headers }));
  };
  return { ...made, handle, join };
}

test('a page on the brand\'s site adds a person, and gets their referral link with every query parameter of the page', async () => {
  const { join, customer } = await setup();
  const response = await join({ email: 'Cy@Example.com', page: `${SITE}/beta?utm_source=reel&utm_content=p1&ref=old#form` });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('access-control-allow-origin'), SITE);
  const { referral } = await response.json() as { referral: string };
  const link = new URL(referral);
  assert.equal(`${link.origin}${link.pathname}`, `${SITE}/beta`);
  assert.equal(link.searchParams.get('utm_source'), 'reel');
  assert.equal(link.searchParams.get('utm_content'), 'p1');
  assert.match(link.searchParams.get('ref') ?? '', /^[A-Za-z0-9]{10}$/);
  assert.equal(link.hash, '');
  const [person] = await customer.waitlistList();
  assert.equal(person.email, 'Cy@Example.com');
  assert.equal(person.activated, null);

  // Joining again keeps the same code and adds no one.
  const again = await (await join({ email: 'cy@example.com', page: `${SITE}/` })).json() as { referral: string };
  assert.equal(new URL(again.referral).searchParams.get('ref'), link.searchParams.get('ref'));
  assert.equal((await customer.waitlistList()).length, 1);
});

test('people who join through a link count toward its owner, and the list is ranked by those counts', async () => {
  const { join, customer, later } = await setup();
  const cy = new URL(((await (await join({ email: 'cy@example.com', page: `${SITE}/` })).json()) as { referral: string }).referral).searchParams.get('ref')!;
  later(1000);
  await join({ email: 'di@example.com' });
  later(1000);
  await join({ email: 'ed@example.com', ref: cy });
  await join({ email: 'fi@example.com', ref: cy });
  await join({ email: 'go@example.com', ref: 'not-a-code' });
  assert.deepEqual((await customer.waitlistList()).map((p) => [p.email, p.referrals]), [
    ['cy@example.com', 2], ['di@example.com', 0], ['ed@example.com', 0], ['fi@example.com', 0], ['go@example.com', 0],
  ]);
});

test('only pages on the brand\'s listed sites may add people', async () => {
  const { join, customer, handle } = await setup();
  assert.equal((await join({ email: 'cy@example.com' }, { origin: 'https://evil.example' })).status, 403);
  assert.equal((await join({ email: 'cy@example.com' }, { origin: null })).status, 403);
  assert.equal((await join({ email: 'cy@example.com' }, { slug: 'other' })).status, 403, 'a brand with no sites takes no joins');
  assert.deepEqual(await customer.waitlistList(), []);
  const preflight = await handle(new Request('https://app.example/join/acme', { method: 'OPTIONS', headers: { origin: SITE } }));
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('access-control-allow-origin'), SITE);
  assert.equal((await handle(new Request('https://app.example/join/acme', { method: 'OPTIONS', headers: { origin: 'https://evil.example' } }))).status, 403);
});

test('a link to a page on another site is not kept, and the site\'s home page is used instead', async () => {
  const { join } = await setup();
  const { referral } = await (await join({ email: 'cy@example.com', page: 'https://evil.example/?x=1' })).json() as { referral: string };
  assert.equal(`${new URL(referral).origin}${new URL(referral).pathname}`, `${SITE}/`);
  assert.equal(new URL(referral).searchParams.get('x'), null);
});

test('a bad address, a filled trap and too many tries add no one', async () => {
  let allowed = true;
  const { join, customer } = await setup({ allow: async () => allowed });
  assert.equal((await join({ email: 'not-an-address' })).status, 400);
  const trapped = await join({ email: 'bot@example.com', website: 'spam' });
  assert.equal(trapped.status, 200, 'a bot is answered as if it joined');
  allowed = false;
  assert.equal((await join({ email: 'cy@example.com' }, { ip: '203.0.113.9' })).status, 429);
  assert.deepEqual(await customer.waitlistList(), []);
});

test('a joiner learns their place in line, which referrals move up and activation takes them out of', async () => {
  const { join, customer, later } = await setup();
  const place = async (fields: Record<string, string>) => ((await (await join(fields)).json()) as { place: number | null }).place;
  assert.equal(await place({ email: 'cy@example.com' }), 1);
  later(1000);
  assert.equal(await place({ email: 'di@example.com' }), 2);
  later(1000);
  const ed = await (await join({ email: 'ed@example.com' })).json() as { referral: string; place: number };
  assert.equal(ed.place, 3);
  await join({ email: 'fi@example.com', ref: new URL(ed.referral).searchParams.get('ref')! });
  assert.equal(await place({ email: 'ed@example.com' }), 1, 'joining again shows their place now, after a referral moved them up');
  await customer.waitlistActivate('ed@example.com');
  assert.equal(await place({ email: 'cy@example.com' }), 1, 'an activated person no longer waits ahead of anyone');
  assert.equal(await place({ email: 'ed@example.com' }), null);
  const page = await join({ email: 'di@example.com' }, { json: false });
  assert.match(await page.text(), /You're number 2 on the list/);
});

test('the page\'s tracking tags are kept as where a person came from, from their first join', async () => {
  const { join, customer } = await setup();
  await join({ email: 'cy@example.com', page: `${SITE}/beta?utm_source=instagram&utm_content=reel-1&other=x&ref=abc` });
  await join({ email: 'di@example.com' });
  await join({ email: 'cy@example.com', page: `${SITE}/?utm_content=reel-2` });
  const [cy, di] = await customer.waitlistList();
  assert.deepEqual(cy.source, { utm_source: 'instagram', utm_content: 'reel-1' });
  assert.deepEqual(di.source, {});
});

test('a brand\'s waitlist made before tags and Instagram were kept gains them, and a handle typed then is not shown', async () => {
  const sql = sqlite();
  sql.all(`CREATE TABLE waitlist (email TEXT PRIMARY KEY, shown TEXT NOT NULL, joined_at INTEGER NOT NULL,
    code TEXT NOT NULL UNIQUE, referred_by TEXT, activated_at INTEGER)`);
  sql.all("INSERT INTO waitlist VALUES ('cy@example.com', 'cy@example.com', 1, 'c0de', NULL, NULL)");
  sql.all('ALTER TABLE waitlist ADD COLUMN instagram TEXT');
  sql.all("UPDATE waitlist SET instagram = 'typed'");
  const customer = new Customer(sql, { vault: aesGcmVault(KEY), events: eventsStandIn().events });
  await customer.waitlistJoin('di@example.com', { source: { utm_content: 'reel-1' } });
  assert.deepEqual((await customer.waitlistList()).map((p) => [p.email, p.instagram, p.engaged]), [['cy@example.com', null, 0], ['di@example.com', null, 0]]);
});

test('a form sent with no script gets a short page with the person\'s link', async () => {
  const { join } = await setup();
  const response = await join({ email: 'cy@example.com', page: `${SITE}/?utm_source=reel` }, { json: false });
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type') ?? '', /text\/html/);
  assert.match(await response.text(), /You're number 1 on the list.*https:\/\/brand\.example\/\?utm_source=reel&amp;ref=/s);
});

test('the snippet posts to the brand\'s join address and sends the page and the code the visitor arrived with', () => {
  const snippet = joinSnippet('https://app.example/join/acme');
  assert.match(snippet, /<form method="post" action="https:\/\/app\.example\/join\/acme" data-cmokit-join>/);
  assert.match(snippet, /body\.set\('page', location\.href\)/);
  assert.match(snippet, /get\('ref'\)/);
  assert.match(snippet, /name="website"/);
  const [join, instagram] = snippet.split('data-cmokit-instagram hidden');
  assert.match(join, /<input type="email" name="email"/);
  assert.doesNotMatch(join, /<input type="text" name="(?!website)/, 'joining asks for the address alone');
  assert.match(instagram, /Boost even more: connect your Instagram.*data-cmokit-connect.*business or creator account/s, 'connecting Instagram is the step after joining');
  assert.match(snippet, /if \(answer\.instagram\)/, 'and shows only when the waitlist offers it');
  assert.match(snippet, /Boost your place: share your referral link/);
  assert.match(snippet, /"You're number " \+ answer\.place/);
});

test('site addresses are kept as https origins, and anything else is refused', async () => {
  const { customer } = newCustomer();
  assert.deepEqual(await customer.waitlistSetSites(['brand.example', 'https://www.brand.example/about', ' ', 'https://brand.example']),
    ['https://brand.example', 'https://www.brand.example']);
  await assert.rejects(customer.waitlistSetSites(['http://brand.example']), /https/);
  await assert.rejects(customer.waitlistSetSites(Array.from({ length: 11 }, (_, i) => `s${i}.example`)), /at most 10/);
  assert.deepEqual(await customer.waitlistSites(), ['https://brand.example', 'https://www.brand.example']);
});
