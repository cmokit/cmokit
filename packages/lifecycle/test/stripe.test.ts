import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { test } from 'node:test';
import { stripe, verify } from '../src/stripe.ts';

const SECRET = 'whsec_test';
const NOW = 1_800_000_000_000;

function signed(body: string, at = NOW / 1000, secret = SECRET) {
  const v1 = createHmac('sha256', secret).update(`${at}.${body}`).digest('hex');
  return new Request('https://site.example/_cmokit/subscriptions/events', { method: 'POST', headers: { 'stripe-signature': `t=${at},v1=${v1}` }, body });
}

function standIn(answers: Record<string, unknown>) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fetch = (async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    const answer = answers[url.split('?')[0]];
    return answer === undefined ? new Response('{}', { status: 404 }) : Response.json(answer);
  }) as typeof globalThis.fetch;
  return { calls, payments: stripe({ key: 'sk_test', webhookSecret: SECRET, fetch, now: () => NOW }) };
}

test('checkout is a subscription session that collects a payment method and carries the customer and person', async () => {
  const s = standIn({ 'https://api.stripe.com/v1/checkout/sessions': { url: 'https://checkout.stripe.com/c/pay/1' } });
  const url = await s.payments.checkout({ customer: 'cnew', person: 'ada', price: 'price_1Abc', trialDays: 14, successUrl: 'https://content.example/ok', cancelUrl: 'https://content.example/no' });
  assert.equal(url, 'https://checkout.stripe.com/c/pay/1');
  const sent = new URLSearchParams(String(s.calls[0].init!.body));
  assert.equal((s.calls[0].init!.headers as Record<string, string>).authorization, 'Bearer sk_test');
  assert.deepEqual(Object.fromEntries(sent), {
    mode: 'subscription', 'line_items[0][price]': 'price_1Abc', 'line_items[0][quantity]': '1', payment_method_collection: 'always',
    client_reference_id: 'cnew', 'subscription_data[metadata][cmokit_customer]': 'cnew', 'subscription_data[metadata][cmokit_person]': 'ada',
    'subscription_data[trial_period_days]': '14', success_url: 'https://content.example/ok', cancel_url: 'https://content.example/no',
  });
});

test('the portal is opened for the customer at Stripe', async () => {
  const s = standIn({ 'https://api.stripe.com/v1/billing_portal/sessions': { url: 'https://billing.stripe.com/p/1' } });
  assert.equal(await s.payments.portal({ billing: 'cus_1', returnUrl: 'https://content.example/back' }), 'https://billing.stripe.com/p/1');
  assert.deepEqual(Object.fromEntries(new URLSearchParams(String(s.calls[0].init!.body))), { customer: 'cus_1', return_url: 'https://content.example/back' });
});

test('a signed subscription event is read again from Stripe, and the subscription as it is now is returned', async () => {
  const s = standIn({ 'https://api.stripe.com/v1/subscriptions/sub_1': { status: 'past_due', customer: 'cus_1', metadata: { cmokit_customer: 'cacme', cmokit_person: 'ada' } } });
  const event = JSON.stringify({ type: 'customer.subscription.updated', data: { object: { id: 'sub_1', object: 'subscription', status: 'active' } } });
  assert.deepEqual(await s.payments.subscriptions(signed(event)), [{ customer: 'cacme', person: 'ada', billing: 'cus_1', status: 'past_due' }]);
  assert.equal(s.calls[0].init!.method, 'GET');
});

test('a forged, stale or replayed signature is refused, and an event about something else is nothing', async () => {
  const s = standIn({ 'https://api.stripe.com/v1/subscriptions/sub_2': { status: 'active', customer: 'cus_2', metadata: {} } });
  const event = JSON.stringify({ type: 'customer.subscription.created', data: { object: { id: 'sub_2', object: 'subscription' } } });
  assert.equal(await s.payments.subscriptions(signed(event, NOW / 1000, 'whsec_other')), undefined);
  assert.equal(await s.payments.subscriptions(signed(event, NOW / 1000 - 301)), undefined);
  assert.equal(await s.payments.subscriptions(new Request('https://site.example', { method: 'POST', body: event })), undefined);
  // A subscription CMOkit's checkout did not start names no customer.
  assert.deepEqual(await s.payments.subscriptions(signed(event)), []);
  const invoice = JSON.stringify({ type: 'invoice.paid', data: { object: { id: 'in_1', object: 'invoice' } } });
  assert.deepEqual(await s.payments.subscriptions(signed(invoice)), []);
});

test('a signature header may carry several v1 signatures, as while a secret is rolled', async () => {
  const body = '{}';
  const good = createHmac('sha256', SECRET).update(`${NOW / 1000}.${body}`).digest('hex');
  assert.equal(await verify(SECRET, `t=${NOW / 1000},v1=${'0'.repeat(64)},v1=${good}`, body, NOW), true);
  assert.equal(await verify(SECRET, `t=${NOW / 1000},v0=${good}`, body, NOW), false);
});
