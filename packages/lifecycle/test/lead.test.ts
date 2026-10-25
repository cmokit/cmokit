import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CAPTURE, newLead } from './fixtures.ts';

const DAY = 86_400_000;
const T0 = 1_800_000_000_000;

test('a lead is sent each message in turn, then the sequence ends and the address is forgotten', async () => {
  const { lead, sent, events } = newLead();
  assert.equal(await lead.start(CAPTURE, T0), T0);
  assert.equal(await lead.wake(T0), T0 + 3 * DAY);
  assert.equal(sent.length, 1);
  const [first] = sent;
  assert.equal(first.to, 'ada@example.com');
  assert.equal(first.from, 'hello@site.example');
  assert.equal(first.subject, 'Welcome aboard');
  assert.equal(first.group, 42);
  assert.equal(first.unsubscribeUrl, 'https://site.example/_cmokit/leads/unsubscribe?s=welcome&l=k1&t=tok');
  assert.deepEqual(first.tags, { cmokit_lead: 'k1', cmokit_visitor: 'v1', cmokit_sequence: 'welcome', cmokit_message: 'welcome' });
  assert.match(first.text, /signed up at site\.example\. Unsubscribe: https:\/\/site\.example\/_cmokit\/leads\/unsubscribe/);
  assert.match(first.text, /1 Main St, Springfield/);

  assert.equal(await lead.wake(T0 + DAY), T0 + 3 * DAY, 'nothing is due yet');
  assert.equal(sent.length, 1);
  assert.equal(await lead.wake(T0 + 3 * DAY), null);
  assert.equal(sent[1].subject, 'Three days in');
  assert.equal(lead.held()?.state, 'done');
  assert.equal(lead.held()?.email, null);

  assert.deepEqual(events.map((e) => e.name), ['sequence_started', 'message_sent', 'message_sent', 'sequence_ended']);
  for (const e of events) {
    assert.equal(e.visitor, 'v1');
    assert.equal(e.properties['$feature/landing'], 'b', 'every event carries the variant the lead came from');
    assert.equal(e.properties.utm_source, 'news');
    assert.equal(e.properties.sequence, 'welcome');
  }
  assert.equal(events.at(-1)?.properties.reason, 'finished');
});

test('a lead captured twice is one lead, and one that stopped is not started again', async () => {
  const { lead, events } = newLead();
  await lead.start(CAPTURE, T0);
  assert.equal(await lead.start({ ...CAPTURE, visitor: 'v2' }, T0 + 5), T0);
  assert.equal(lead.held()?.visitor, 'v1');
  await lead.stop('converted: trial_started', undefined);
  assert.equal(await lead.start(CAPTURE, T0 + 10), null);
  assert.equal(lead.held()?.state, 'stopped');
  assert.equal(events.filter((e) => e.name === 'sequence_started').length, 1);
});

test('a stopping event delivered twice acts once, and nothing more is sent', async () => {
  const { lead, sent, events } = newLead();
  await lead.start(CAPTURE, T0);
  await lead.stop('bounced', 'evt-1');
  await lead.stop('bounced', 'evt-1');
  assert.equal(await lead.wake(T0), null);
  assert.deepEqual(sent, []);
  assert.equal(lead.held()?.reason, 'bounced');
  assert.equal(lead.held()?.email, null);
  assert.equal(events.filter((e) => e.name === 'sequence_ended').length, 1);
});

test('only the lead\'s own token unsubscribes it, and the address is handed back to suppress', async () => {
  const { lead } = newLead();
  await lead.start(CAPTURE, T0);
  assert.equal(await lead.unsubscribe('guess'), undefined);
  assert.equal(lead.held()?.state, 'active');
  assert.equal(await lead.unsubscribe('tok'), 'ada@example.com');
  assert.equal(lead.held()?.state, 'stopped');
  assert.equal(lead.held()?.reason, 'unsubscribed');
  assert.equal(await lead.unsubscribe('tok'), null, 'again, the address is already forgotten');
});

test('a failed send is tried again an hour later, and a message that fails five times ends the sequence', async () => {
  const { lead, sent, fail } = newLead();
  await lead.start(CAPTURE, T0);
  fail(true);
  let at = T0;
  for (let i = 0; i < 4; i++) {
    const next = await lead.wake(at);
    assert.equal(next, at + 3_600_000);
    assert.equal(lead.held()?.step, 0);
    at = next!;
  }
  fail(false);
  assert.equal(await lead.wake(at), at + 3 * 86_400_000, 'the fifth try succeeds');
  assert.equal(sent.length, 1);

  const again = newLead();
  await again.lead.start(CAPTURE, T0);
  again.fail(true);
  at = T0;
  for (let i = 0; i < 5; i++) at = (await again.lead.wake(at)) ?? at;
  assert.equal(again.lead.held()?.state, 'stopped');
  assert.equal(again.lead.held()?.reason, 'undeliverable');
});
