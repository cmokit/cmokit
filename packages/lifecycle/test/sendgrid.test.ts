import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { test } from 'node:test';
import { sendgrid } from '../src/sendgrid.ts';

const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
const WEBHOOK_KEY = publicKey.export({ type: 'spki', format: 'der' }).toString('base64');

/** A request signed as SendGrid signs its event webhook: DER-encoded ECDSA over timestamp and body. */
function signed(body: string, timestamp = '1800000000', tamper = false) {
  const signature = sign('sha256', Buffer.from(timestamp + body), privateKey).toString('base64');
  return new Request('https://site.example/_cmokit/leads/events', {
    method: 'POST',
    headers: {
      'x-twilio-email-event-webhook-signature': signature,
      'x-twilio-email-event-webhook-timestamp': tamper ? '1800000001' : timestamp,
    },
    body,
  });
}

function recording(status = 202) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetch = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(status === 202 ? '' : '{"errors":[{"message":"bad"}]}', { status });
  }) as unknown as typeof globalThis.fetch;
  return { calls, fetch };
}

const message = {
  to: 'ada@example.com', from: 'hello@site.example', fromName: 'Site', subject: 'Hi', text: 'text', html: '<p>html</p>',
  unsubscribeUrl: 'https://site.example/_cmokit/leads/unsubscribe?s=welcome&l=k&t=t', group: 42,
  tags: { cmokit_lead: 'k', cmokit_visitor: 'v', cmokit_sequence: 'welcome', cmokit_message: 'welcome' },
};

test('a message is sent through Mail Send with its unsubscribe group, one-click headers and tags', async () => {
  const { calls, fetch } = recording();
  await sendgrid({ key: 'SG.secret', fetch }).send(message);
  const [{ url, init }] = calls;
  assert.equal(url, 'https://api.sendgrid.com/v3/mail/send');
  assert.equal(new Headers(init.headers).get('authorization'), 'Bearer SG.secret');
  const body = JSON.parse(String(init.body));
  assert.deepEqual(body.personalizations, [{ to: [{ email: 'ada@example.com' }] }]);
  assert.deepEqual(body.from, { email: 'hello@site.example', name: 'Site' });
  assert.deepEqual(body.content.map((c: { type: string }) => c.type), ['text/plain', 'text/html']);
  assert.deepEqual(body.asm, { group_id: 42, groups_to_display: [42] });
  assert.deepEqual(body.headers, {
    'List-Unsubscribe': `<${message.unsubscribeUrl}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
  });
  assert.deepEqual(body.custom_args, message.tags);
  assert.deepEqual(body.categories, ['welcome']);
});

test('a refusal is an error naming the status, never the key, and suppressing adds to the group', async () => {
  const failing = recording(401);
  await assert.rejects(sendgrid({ key: 'SG.secret', fetch: failing.fetch }).send(message), (error: Error) => {
    assert.match(error.message, /^SendGrid POST \/mail\/send answered 401: /);
    assert.doesNotMatch(error.message, /SG\.secret/);
    return true;
  });
  const { calls, fetch } = recording();
  await sendgrid({ key: 'SG.secret', fetch }).suppress('ada@example.com', 42);
  assert.equal(calls[0].url, 'https://api.sendgrid.com/v3/asm/groups/42/suppressions');
  assert.deepEqual(JSON.parse(String(calls[0].init.body)), { recipient_emails: ['ada@example.com'] });
});

test('the event webhook is read only when its signature verifies', async () => {
  const events = JSON.stringify([
    { event: 'open', sg_event_id: 'e1', timestamp: 1800000000, cmokit_lead: 'k', cmokit_visitor: 'v', other: 'x' },
    { event: 'click', sg_event_id: 'e2', timestamp: 1800000001, url: 'https://site.example/guide', cmokit_lead: 'k' },
    { event: 'bounce', type: 'bounce', sg_event_id: 'e3', timestamp: 1 },
    { event: 'bounce', type: 'blocked', sg_event_id: 'e4', timestamp: 1 },
    { event: 'group_unsubscribe', sg_event_id: 'e5', timestamp: 1 },
    { event: 'spamreport', sg_event_id: 'e6', timestamp: 1 },
    { event: 'processed', sg_event_id: 'e7', timestamp: 1 },
  ]);
  const adapter = sendgrid({ key: 'SG.secret', webhookKey: WEBHOOK_KEY });
  const reports = await adapter.reports(signed(events));
  assert.ok(reports);
  assert.deepEqual(reports.map((r) => r.kind), ['opened', 'clicked', 'bounced', 'other', 'unsubscribed', 'spam_reported', 'other']);
  assert.deepEqual(reports[0], { id: 'e1', kind: 'opened', at: 1800000000000, tags: { cmokit_lead: 'k', cmokit_visitor: 'v' } });
  assert.equal(reports[1].url, 'https://site.example/guide');

  assert.equal(await adapter.reports(signed(events, '1800000000', true)), undefined, 'a changed timestamp');
  const forged = signed(events);
  assert.equal(await adapter.reports(new Request(forged, { body: events.replace('open', 'click') })), undefined, 'a changed body');
  assert.equal(await sendgrid({ key: 'SG.secret' }).reports(signed(events)), undefined, 'no verification key');
});
