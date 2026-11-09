// A product's subscriptions (ADR-0017): the checkout link that starts one, the portal link that
// manages one, and the payment processor's events, each of which gives or revokes the customer's
// access in the product. The customer is created at its first checkout, with the person who paid as
// its first user (CUS-03), by the product's own API (ADR-0004). An event is acted on by reading the
// subscription as it is now and setting the product to match, so an event delivered twice, or out of
// order, acts once (SUB-06).

import type { Resolved } from '@cmokit/cli';

/** A subscription as the payment processor holds it now. */
export interface Subscription {
  /** The customer's id in the product, given at checkout. */
  customer: string;
  /** The person who paid, the customer's first user. */
  person: string;
  /** The customer's id at the payment processor, which the portal is opened for. */
  billing: string;
  status: 'trialing' | 'active' | 'past_due' | 'unpaid' | 'canceled' | 'incomplete' | 'incomplete_expired' | 'paused';
}

export interface Payments {
  /** A hosted checkout link that starts the trial and creates the customer with its first user. */
  checkout(options: { customer: string; person: string; price: string; trialDays: number; successUrl: string; cancelUrl: string }): Promise<string>;
  /** A link to the customer's self-service portal (SUB-03). */
  portal(options: { billing: string; returnUrl: string }): Promise<string>;
  /**
   * The subscriptions a request from the payment processor is about, each read as it is now; an
   * empty list for an event about nothing this handles, and undefined when the request is not
   * genuinely from it.
   */
  subscriptions(request: Request): Promise<Subscription[] | undefined>;
}

/** Access in the product, as the lifecycle sets it. */
export type Access = 'trial' | 'active' | 'lapsed';

/** The product's API the lifecycle calls (ADR-0004). Each call is safe to repeat. */
export interface Product {
  /** Creates the customer, if it does not exist, with the person as a user. */
  provision(customer: string, person: string, billing: string): Promise<void>;
  access(customer: string, access: Access): Promise<void>;
}

/**
 * Access for a subscription's status. A failed payment keeps access while the processor retries it;
 * a subscription that is unpaid after those retries, or has ended, revokes it (SUB-04).
 */
export function accessFor(status: Subscription['status']): Access {
  if (status === 'trialing') return 'trial';
  if (status === 'active' || status === 'past_due') return 'active';
  return 'lapsed';
}

const URL_FIELD = (value: unknown): value is string => typeof value === 'string' && URL.canParse(value) && new URL(value).protocol === 'https:';

export function createSubscriptions(options: { config: Resolved; payments: Payments; product: Product; newCustomer?(): string }) {
  const { payments, product } = options;
  const subscription = options.config.subscription;
  const newCustomer = options.newCustomer ?? (() => `c${crypto.randomUUID().replace(/-/g, '').slice(0, 15)}`);

  return {
    /** Answers the product's ask for a checkout link for a signed-in person. */
    async checkout(request: Request): Promise<Response> {
      if (!subscription) return new Response('This product sells no subscription', { status: 404 });
      const body = await request.json().catch(() => ({})) as Record<string, unknown>;
      const { person, successUrl, cancelUrl } = body;
      if (typeof person !== 'string' || !person || !URL_FIELD(successUrl) || !URL_FIELD(cancelUrl)) return new Response(null, { status: 400 });
      const url = await payments.checkout({ customer: newCustomer(), person, price: subscription.price, trialDays: subscription.trialDays, successUrl, cancelUrl });
      return Response.json({ url });
    },

    /** Answers the product's ask for a portal link for one of its customers. */
    async portal(request: Request): Promise<Response> {
      const body = await request.json().catch(() => ({})) as Record<string, unknown>;
      const { billing, returnUrl } = body;
      if (typeof billing !== 'string' || !billing || !URL_FIELD(returnUrl)) return new Response(null, { status: 400 });
      return Response.json({ url: await payments.portal({ billing, returnUrl }) });
    },

    /** The payment processor's events. A failure answers 500, so the processor sends the event again. */
    async events(request: Request): Promise<Response> {
      const found = await payments.subscriptions(request);
      if (!found) return new Response(null, { status: 403 });
      for (const s of found) {
        await product.provision(s.customer, s.person, s.billing);
        await product.access(s.customer, accessFor(s.status));
      }
      return new Response(null, { status: 204 });
    },
  };
}
