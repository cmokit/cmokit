import assert from 'node:assert/strict';
import { test } from 'node:test';
import { counts, engagement, shown, stateOf, type Person } from '../apps/waitlist/list.ts';

const person = (email: string, more: Partial<Person> = {}): Person => ({
  email, joined: '2026-11-01T00:00:00.000Z', referrals: 0, activated: null, declined: null, instagram: null, engaged: 0, source: {}, ...more,
});

// As the server ranks them: referrals plus Reels commented on, then who joined first.
const people = [
  person('cy@example.com', { referrals: 2, engaged: 3, instagram: 'cy.makes', joined: '2026-11-03T00:00:00.000Z' }),
  person('di@example.com', { referrals: 1, joined: '2026-11-01T00:00:00.000Z' }),
  person('ed@example.com', { joined: '2026-11-02T00:00:00.000Z', declined: '2026-11-04T00:00:00.000Z' }),
  person('fi@example.com', { joined: '2026-11-05T00:00:00.000Z', activated: '2026-11-06T00:00:00.000Z' }),
  person('gu@example.com', { joined: '2026-11-04T00:00:00.000Z' }),
];
const emails = (list: Person[]) => list.map((p) => p.email);

test('the card keeps the server\'s engagement order, and declined people show only under Declined', () => {
  assert.deepEqual(emails(shown(people, 'waiting', 'engaged')), ['cy@example.com', 'di@example.com', 'gu@example.com']);
  assert.deepEqual(emails(shown(people, 'declined', 'engaged')), ['ed@example.com']);
  assert.deepEqual(emails(shown(people, 'activated', 'engaged')), ['fi@example.com']);
  assert.deepEqual(counts(people), { waiting: 3, activated: 1, declined: 1 });
  assert.equal(engagement(people[0]), 5);
  assert.equal(stateOf(person('x@example.com', { activated: 'a', declined: 'b' })), 'activated');
});

test('the card sorts by when people joined, and searches addresses and proved handles', () => {
  assert.deepEqual(emails(shown(people, 'waiting', 'newest')), ['gu@example.com', 'cy@example.com', 'di@example.com']);
  assert.deepEqual(emails(shown(people, 'waiting', 'oldest')), ['di@example.com', 'cy@example.com', 'gu@example.com']);
  assert.deepEqual(emails(shown(people, 'waiting', 'engaged', '@CY.')), ['cy@example.com']);
  assert.deepEqual(emails(shown(people, 'waiting', 'engaged', 'di@')), ['di@example.com']);
  assert.deepEqual(emails(shown(people, 'waiting', 'engaged', 'ed@')), [], 'a search does not reach past the filter');
});

test('the card\'s theme is CMOkit\'s own look, token for token, in light and dark', async () => {
  const { readFileSync } = await import('node:fs');
  const { LOOK } = await import('@cmokit/issuer/look');
  const theme = readFileSync(new URL('../apps/theme.css', import.meta.url), 'utf8');
  const tokens = (css: string) => new Map([...css.matchAll(/--([a-z-]+):\s*(#[0-9a-f]{3,6})/gi)].map((m) => [m[1], m[2].toLowerCase()]));
  // The look's light tokens come first, then its dark ones; the card defines dark twice, for the
  // person's setting and for the host's theme.
  const [lookLight, lookDark] = LOOK.split('@media (prefers-color-scheme:dark)');
  const [cardLight, cardRest] = theme.split('@media (prefers-color-scheme: dark)');
  const [cardSetting, cardHost] = cardRest.split(':root[data-theme="dark"]');
  assert.deepEqual(tokens(cardLight), tokens(lookLight));
  assert.deepEqual(tokens(cardSetting), tokens(lookDark.split('}}')[0]));
  assert.deepEqual(tokens(cardHost.split('}')[0]), tokens(lookDark.split('}}')[0]));
});
