import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createLifecycle, type Access, type Payments, type Subscription } from '../src/index.ts';
import { createSubscriptions } from '../src/subscriptions.ts';
import { analyticsStandIn, messagingStandIn, resolved } from './fixtures.ts';

const SOLD = { ...resolved, subscription: { trialDays: 14, price: 'price_1Abc' } };

function setup(held: Subscription[] | 'forged' = []) {
  const checkouts: object[] = [];
  const calls: string[] = [];
  const payments: Payments = {
    checkout: async (options) => { checkouts.push(options); return 'https://checkout.example/c/1'; },
    portal: async ({ billing, returnUrl }) => `https://billing.example/${billing}?back=${returnUrl}`,
    subscriptions: async () => (held === 'forged' ? undefined : held),
  };
  const product = {
    provision: async (customer: string, person: string, billing: string) => void calls.push(`provision ${customer} ${person} ${billing}`),
    access: async (customer: string, access: Access) => void calls.push(`access ${customer} ${access}`),
  };
  const subscriptions = createSubscriptions({ config: SOLD, payments, product, newCustomer: () => 'cnew' });
  const handle = createLifecycle({
    config: SOLD, messaging: messagingStandIn([]).messaging, analytics: analyticsStandIn().analytics, subscriptions,
    leads: { start: async () => undefined, stop: async () => undefined, unsubscribe: async () => undefined },
  });
  const post = (path: string, body: unknown) => handle(new Request(`https://lifecycle.internal${path}`, { method: 'POST', body: JSON.stringify(body) }));
  return { post, checkouts, calls };
}

test('a checkout link makes a new customer with the person as its first user, on the configured plan and trial', async () => {
  const lc = setup();
  const back = { successUrl: 'https://content.example/subscription?s=started', cancelUrl: 'https://content.example/subscription?s=cancelled' };
  const response = await lc.post('/internal/checkout', { person: 'ada', ...back });
  assert.deepEqual(await response.json(), { url: 'https://checkout.example/c/1' });
  assert.deepEqual(lc.checkouts, [{ customer: 'cnew', person: 'ada', price: 'price_1Abc', trialDays: 14, ...back }]);
  assert.equal((await lc.post('/internal/checkout', { person: 'ada', successUrl: 'javascript:alert(1)', cancelUrl: back.cancelUrl })).status, 400);
  assert.equal((await lc.post('/internal/checkout', { ...back })).status, 400);
});

test('a portal link is made for the customer at the payment processor', async () => {
  const lc = setup();
  const response = await lc.post('/internal/portal', { billing: 'cus_1', returnUrl: 'https://content.example/subscription?s=managed' });
  assert.deepEqual(await response.json(), { url: 'https://billing.example/cus_1?back=https://content.example/subscription?s=managed' });
});

test('each subscription event provisions the customer and sets its access from the subscription as it is now', async () => {
  for (const [status, access] of [['trialing', 'trial'], ['active', 'active'], ['past_due', 'active'], ['unpaid', 'lapsed'], ['canceled', 'lapsed'], ['incomplete_expired', 'lapsed'], ['paused', 'lapsed']] as const) {
    const lc = setup([{ customer: 'cacme', person: 'ada', billing: 'cus_1', status }]);
    assert.equal((await lc.post('/_cmokit/subscriptions/events', {})).status, 204);
    assert.deepEqual(lc.calls, ['provision cacme ada cus_1', `access cacme ${access}`], status);
  }
});

test('an event that is not genuinely from the payment processor is refused and acts on nothing', async () => {
  const lc = setup('forged');
  assert.equal((await lc.post('/_cmokit/subscriptions/events', {})).status, 403);
  assert.deepEqual(lc.calls, []);
});

test('a product that sells no subscription has none of these routes', async () => {
  const handle = createLifecycle({
    config: resolved, messaging: messagingStandIn([]).messaging, analytics: analyticsStandIn().analytics,
    leads: { start: async () => undefined, stop: async () => undefined, unsubscribe: async () => undefined },
  });
  const response = await handle(new Request('https://lifecycle.internal/internal/checkout', { method: 'POST', body: '{"person":"ada"}' }));
  assert.equal(response.status, 404);
});
