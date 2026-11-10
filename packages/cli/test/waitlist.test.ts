import assert from 'node:assert/strict';
import { test } from 'node:test';
import { run } from '../src/command.ts';

const LIST = [
  { email: 'ada@example.com', joined: '2026-11-10T10:00:00.000Z', code: 'aaaa', referredBy: null, referrals: 2, activated: null },
  { email: 'bo@example.com', joined: '2026-11-10T11:00:00.000Z', code: 'bbbb', referredBy: 'aaaa', referrals: 0, activated: '2026-11-11T09:00:00.000Z' },
];

function cli(answer: (url: URL, init: RequestInit) => Response, env: Record<string, string> = { CMOKIT_WAITLIST_KEY: 'k' }) {
  const lines: string[] = [];
  const asked: { url: string; init: RequestInit }[] = [];
  const fetch = (async (url: URL, init: RequestInit) => {
    asked.push({ url: String(url), init });
    return answer(url, init);
  }) as typeof globalThis.fetch;
  return { lines, asked, go: (...args: string[]) => run(args, { env, fetch, out: (l) => lines.push(l) }) };
}

test('lists the waitlist, ranked as the site ranks it, with the waitlist key', async () => {
  const c = cli(() => Response.json({ waitlist: LIST }));
  assert.equal(await c.go('waitlist', '--site', 'https://site.example/any/page'), 0);
  assert.equal(c.asked[0].url, 'https://site.example/_cmokit/waitlist');
  assert.equal((c.asked[0].init.headers as Record<string, string>).authorization, 'Bearer k');
  assert.match(c.lines[0], /1\. ada@example\.com\s+2 referrals, joined 2026-11-10, waiting/);
  assert.match(c.lines[1], /2\. bo@example\.com\s+0 referrals, joined 2026-11-10, activated 2026-11-11/);
});

test('activates a person and says whether the message went out', async () => {
  const c = cli(() => Response.json({ email: 'ada@example.com', activated: true, sent: true }));
  assert.equal(await c.go('waitlist', 'activate', 'ada@example.com', '--site', 'https://site.example'), 0);
  assert.equal(c.asked[0].url, 'https://site.example/_cmokit/waitlist/activate');
  assert.equal(c.asked[0].init.method, 'POST');
  assert.equal(c.asked[0].init.body, JSON.stringify({ email: 'ada@example.com' }));
  assert.equal(c.lines[0], 'Activated ada@example.com, and sent the activation message.');
});

test('says plainly what went wrong', async () => {
  const missing = cli(() => Response.json({ problem: 'not on the waitlist' }, { status: 404 }));
  assert.equal(await missing.go('waitlist', 'activate', 'zed@example.com', '--site', 'https://site.example'), 1);
  assert.equal(missing.lines[0], 'cmokit: not on the waitlist');
  const refused = cli(() => new Response(null, { status: 401 }));
  assert.equal(await refused.go('waitlist', '--site', 'https://site.example'), 1);
  assert.equal(refused.lines[0], 'cmokit: the site refused CMOKIT_WAITLIST_KEY');
  const unset = cli(() => Response.json({}), {});
  assert.equal(await unset.go('waitlist', '--site', 'https://site.example'), 1);
  assert.equal(unset.lines[0], 'cmokit: CMOKIT_WAITLIST_KEY is not set');
  assert.equal(unset.asked.length, 0);
  const plain = cli(() => Response.json({}));
  assert.equal(await plain.go('waitlist', '--site', 'http://site.example'), 1);
  assert.equal(plain.asked.length, 0, 'the key is never sent over plain http');
});

test('needs a site, and an address to activate', async () => {
  const c = cli(() => Response.json({}));
  assert.equal(await c.go('waitlist'), 2);
  assert.equal(await c.go('waitlist', 'activate', '--site', 'https://site.example'), 2);
  assert.equal(c.asked.length, 0);
});
