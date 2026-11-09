// Stripe behind the payments interface (ADR-0012). Checkout and the customer portal are Stripe's own
// hosted pages. Its webhook is read only after verifying the request's signature, and each event's
// subscription is then read again from Stripe, so what the lifecycle acts on is the subscription as
// it is now, not as one event described it. The secret key is a Worker secret and is never logged.

import type { Payments, Subscription } from './subscriptions.ts';

export interface StripeOptions {
  /** A secret or restricted key that can write Checkout Sessions and portal sessions and read subscriptions. */
  key: string;
  /** The webhook endpoint's signing secret, whsec_... */
  webhookSecret?: string;
  fetch?: typeof fetch;
  now?(): number;
}

const API = 'https://api.stripe.com/v1';
/** How old a signed event may be, against replay. Stripe's own libraries use five minutes. */
const TOLERANCE_S = 300;
const EVENTS = new Set(['customer.subscription.created', 'customer.subscription.updated', 'customer.subscription.deleted',
  'customer.subscription.paused', 'customer.subscription.resumed']);

/** Stripe's form encoding of nested parameters, such as `line_items[0][price]`. */
function form(params: Record<string, string | number>): string {
  return Object.entries(params).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`).join('&');
}

export function stripe(options: StripeOptions): Payments {
  const send = options.fetch ?? fetch;
  const now = options.now ?? (() => Date.now());

  async function call<T>(method: 'GET' | 'POST', path: string, params?: Record<string, string | number>): Promise<T> {
    const response = await send(`${API}${path}`, {
      method,
      headers: { authorization: `Bearer ${options.key}`, ...(params ? { 'content-type': 'application/x-www-form-urlencoded' } : {}) },
      ...(params ? { body: form(params) } : {}),
    });
    if (!response.ok) throw new Error(`Stripe ${method} ${path.split('?')[0]} answered ${response.status}`);
    return response.json() as Promise<T>;
  }

  return {
    async checkout({ customer, person, price, trialDays, successUrl, cancelUrl }) {
      const session = await call<{ url: string }>('POST', '/checkout/sessions', {
        mode: 'subscription',
        'line_items[0][price]': price,
        'line_items[0][quantity]': 1,
        payment_method_collection: 'always',
        client_reference_id: customer,
        'subscription_data[metadata][cmokit_customer]': customer,
        'subscription_data[metadata][cmokit_person]': person,
        ...(trialDays > 0 ? { 'subscription_data[trial_period_days]': trialDays } : {}),
        success_url: successUrl,
        cancel_url: cancelUrl,
      });
      return session.url;
    },

    async portal({ billing, returnUrl }) {
      const session = await call<{ url: string }>('POST', '/billing_portal/sessions', { customer: billing, return_url: returnUrl });
      return session.url;
    },

    async subscriptions(request) {
      if (!options.webhookSecret) return undefined;
      const body = await request.text();
      if (!(await verify(options.webhookSecret, request.headers.get('stripe-signature') ?? '', body, now()))) return undefined;
      const event = JSON.parse(body) as { type?: string; data?: { object?: { id?: string; object?: string } } };
      const id = event.data?.object?.id;
      if (!EVENTS.has(event.type ?? '') || event.data?.object?.object !== 'subscription' || typeof id !== 'string') return [];
      const held = await call<{ status: Subscription['status']; customer: string; metadata?: Record<string, string> }>('GET', `/subscriptions/${encodeURIComponent(id)}`);
      const customer = held.metadata?.cmokit_customer;
      const person = held.metadata?.cmokit_person;
      // A subscription CMOkit's checkout did not start names no customer, and is not this product's.
      if (!customer || !person) return [];
      return [{ customer, person, billing: held.customer, status: held.status }];
    },
  };
}

/** Checks a Stripe-Signature header (`t=...,v1=...`) against the body, within the tolerance. */
export async function verify(secret: string, header: string, body: string, nowMs: number): Promise<boolean> {
  const parts = header.split(',').map((part) => part.split('=', 2) as [string, string]);
  const timestamp = Number(parts.find(([k]) => k === 't')?.[1]);
  const signatures = parts.filter(([k]) => k === 'v1').map(([, v]) => v);
  if (!Number.isInteger(timestamp) || signatures.length === 0 || Math.abs(nowMs / 1000 - timestamp) > TOLERANCE_S) return false;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${timestamp}.${body}`)));
  const expected = [...mac].map((b) => b.toString(16).padStart(2, '0')).join('');
  return signatures.some((signature) => equal(signature, expected));
}

function equal(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return difference === 0;
}
