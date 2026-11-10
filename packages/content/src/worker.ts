// The Cloudflare Worker adapter. A content server's Worker is:
//
//   const { worker, Customer, Access } = createContentWorker({ tokens: (env) => ... });
//   export { Customer, Access };
//   export default worker;
//
// with `Customer` bound as the Durable Object class CUSTOMERS, one object per customer, named by the
// slug its path carries (ADR-0030). `Access` is the API the lifecycle calls, over a service binding to
// this entrypoint, to make a customer at its first checkout and to give and revoke its access
// (ADR-0017); the server asks the lifecycle for checkout and portal links over the LIFECYCLE binding. Every variable and secret it reads is in the deployment
// reference. How tokens are checked is passed in; `issuerTokens` is the adapter for CMOkit's own
// issuer (ADR-0018, ADR-0029), which checks each token with the issuer over the ISSUER service
// binding. A person whose proven email address is in ACTIVATED_EMAILS, or whom a maintainer activated
// on the site's waitlist, which the server asks the lifecycle about, is made a customer of their own
// at their first call, with no checkout (CUS-03, ADR-0014). The only host-specific code in the content server
// lives here.

import { WorkerEntrypoint } from 'cloudflare:workers';
import { Customer as CustomerLogic, Refusal } from './customer.ts';
import { createContentServer, type AccountOptions, type Billing, type CustomerPages, type Tokens } from './index.ts';
import { luma } from './luma.ts';
import type { Sql } from './sql.ts';
import type { CustomerCalls } from './tools.ts';
import { aesGcmVault } from './vault.ts';

export interface ContentEnv {
  CUSTOMERS: DurableObjectNamespace;
  /** The issuer's address. A variable. */
  ISSUER_URL: string;
  /** The audience the issuer issues the content server's tokens for. A variable. */
  AUDIENCE: string;
  /** 32 random bytes as base64, which seal each customer's credentials. A secret. */
  CREDENTIAL_KEY: string;
  /** CMOkit's issuer, as a service binding, when its tokens are checked with `issuerTokens`. */
  ISSUER?: IssuerBinding;
  /** CMOkit's lifecycle, as a service binding, when the server sells a subscription (ADR-0017). */
  LIFECYCLE?: { fetch(input: string, init?: RequestInit): Promise<Response> };
  /**
   * The email addresses activated without a checkout, as in a closed beta, separated by commas or
   * spaces. A person whose proven address is one of them gets a customer of their own at their first
   * call. A variable.
   */
  ACTIVATED_EMAILS?: string;
  /** Where the terms every user accepts are published, as a closed beta's (ADR-0039). A variable. */
  TERMS_URL?: string;
  /** The terms' current version; a user accepts each new version. A variable. */
  TERMS_VERSION?: string;
  /** Where the account page is served, as https://app.cmokit.ai; no account page without it (ADR-0041). A variable. */
  APP_URL?: string;
}

/** What CMOkit's issuer offers the content server over its service binding. */
export interface IssuerBinding {
  /** The issuer's own routes, as its token endpoint, which the account page signs in through. */
  fetch?(input: string, init?: RequestInit): Promise<Response>;
  validateToken(resource: string, token: string): Promise<{ userId: string; audience: string; props: { person: string; customer: string | null } } | null>;
  /** The customers a person is a user of. */
  customers(person: string): Promise<string[]>;
  addCustomer(person: string, customer: string): Promise<void>;
  /** The email address a person proved when signing in, if any. */
  email(person: string): Promise<string | null>;
}

// The lifecycle's own routes, as @cmokit/cli names them; the content server does not depend on it.
const LIFECYCLE_ORIGIN = 'https://lifecycle.internal';
const LIFECYCLE_CHECKOUT = '/internal/checkout';
const LIFECYCLE_PORTAL = '/internal/portal';
const LIFECYCLE_ACTIVATED = '/internal/activated';

/** The lifecycle's checkout and portal links, over its service binding. */
export function lifecycleBilling(env: ContentEnv): Billing | undefined {
  const lifecycle = env.LIFECYCLE;
  if (!lifecycle) return undefined;
  const ask = async (path: string, body: object) => {
    const response = await lifecycle.fetch(`${LIFECYCLE_ORIGIN}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    if (!response.ok) throw new Error(`The lifecycle answered ${response.status}`);
    return ((await response.json()) as { url: string }).url;
  };
  return {
    checkout: (person, { successUrl, cancelUrl }) => ask(LIFECYCLE_CHECKOUT, { person, successUrl, cancelUrl }),
    portal: (billing, returnUrl) => ask(LIFECYCLE_PORTAL, { billing, returnUrl }),
  };
}

/** Whether a maintainer activated this address on the site's waitlist; false when the lifecycle cannot say. */
export async function waitlistActivated(lifecycle: NonNullable<ContentEnv['LIFECYCLE']>, email: string): Promise<boolean> {
  const response = await lifecycle.fetch(`${LIFECYCLE_ORIGIN}${LIFECYCLE_ACTIVATED}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email }),
  });
  if (!response.ok) return false;
  return ((await response.json()) as { activated?: boolean }).activated === true;
}

/** The addresses in ACTIVATED_EMAILS, in lower case. */
export function activatedEmails(env: ContentEnv): Set<string> {
  return new Set((env.ACTIVATED_EMAILS ?? '').split(/[\s,]+/).map((a) => a.trim().toLowerCase()).filter(Boolean));
}

/** A person's own customer's slug, the same every time, so activating them twice makes one customer. */
export async function activatedSlug(person: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`activated ${person}`)));
  return `c${[...digest].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 15)}`;
}

/** Checks tokens with CMOkit's own issuer, for the content server's audience alone. */
export function issuerTokens(env: ContentEnv): Tokens {
  return {
    async check(token) {
      if (!env.ISSUER) throw new Error('The ISSUER service binding is not set');
      const valid = await env.ISSUER.validateToken(env.AUDIENCE, token);
      if (!valid) return undefined;
      return { person: valid.userId, audience: valid.audience, customer: valid.props?.customer ?? undefined };
    },
  };
}

export interface DurableObjectNamespace {
  idFromName(name: string): unknown;
  get(id: unknown): { fetch(input: string, init?: RequestInit): Promise<Response> };
}

export interface DurableObjectState {
  storage: { sql: { exec(query: string, ...params: unknown[]): { toArray(): Record<string, string | number | null>[] } } };
}

/** The lifecycle's entrypoint into this Worker, as the runtime constructs it. */
export interface AccessEntrypoint {
  new (ctx: unknown, env: ContentEnv): {
    provision(customer: string, person: string, billing: string): Promise<void>;
    access(customer: string, access: 'trial' | 'active' | 'lapsed'): Promise<void>;
  };
}

export interface CustomerClass {
  new (ctx: DurableObjectState, env: ContentEnv): { fetch(request: Request): Promise<Response> };
}

/** The calls the Worker may make on a customer's object. */
const CALLS = ['status', 'brandRead', 'brandHistory', 'brandChange', 'offersList', 'pieceSave', 'piecesList', 'resultsRead', 'isUser',
  'access', 'billing', 'linkFor', 'connect', 'termsAccepted', 'termsLink', 'termsFor', 'acceptTerms', 'provision', 'setAccess', 'addUser', 'exportAll'] as const;
type Call = (typeof CALLS)[number];

/** The account page, at APP_URL, signing in through the issuer over its service binding (ADR-0041). */
export function accountFor(env: ContentEnv): AccountOptions | undefined {
  const issuer = env.ISSUER;
  if (!env.APP_URL || !issuer?.fetch) return undefined;
  const fetchIssuer = issuer.fetch.bind(issuer);
  return {
    origin: new URL(env.APP_URL).origin,
    exchange: async (form) => {
      const response = await fetchIssuer(`${env.ISSUER_URL.replace(/\/$/, '')}/oauth/token`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: form.toString(),
      });
      if (!response.ok) return undefined;
      const body = await response.json() as { access_token?: unknown; expires_in?: unknown };
      if (typeof body.access_token !== 'string') return undefined;
      return { access_token: body.access_token, ...(typeof body.expires_in === 'number' ? { expires_in: body.expires_in } : {}) };
    },
    email: (person) => issuer.email(person),
  };
}

export function createContentWorker(options: { tokens(env: ContentEnv): Tokens }) {
  class Customer {
    readonly #logic: CustomerLogic;

    constructor(ctx: DurableObjectState, env: ContentEnv) {
      const sql: Sql = { all: (query, ...params) => ctx.storage.sql.exec(query, ...params).toArray() };
      this.#logic = new CustomerLogic(sql, { vault: aesGcmVault(env.CREDENTIAL_KEY), events: luma() });
    }

    async fetch(request: Request): Promise<Response> {
      const call = new URL(request.url).pathname.slice(1) as Call;
      if (!CALLS.includes(call)) return new Response(null, { status: 404 });
      const args = await request.json() as unknown[];
      try {
        const result = await (this.#logic[call] as (...a: unknown[]) => Promise<unknown>)(...args);
        return Response.json({ result: result ?? null });
      } catch (error) {
        if (error instanceof Refusal) return Response.json({ refusal: error.message }, { status: 422 });
        throw error;
      }
    }
  }

  type CustomerAdmin = Pick<CustomerLogic, 'provision' | 'setAccess' | 'addUser'>;
  const customerFor = (env: ContentEnv, slug: string): CustomerCalls & CustomerPages & CustomerAdmin => {
    const stub = env.CUSTOMERS.get(env.CUSTOMERS.idFromName(slug));
    const call = async (name: Call, ...args: unknown[]) => {
      const response = await stub.fetch(`https://customer/${name}`, { method: 'POST', body: JSON.stringify(args) });
      const body = await response.json() as { result?: unknown; refusal?: string };
      if (body.refusal !== undefined) throw new Refusal(body.refusal);
      return body.result;
    };
    return Object.fromEntries(CALLS.map((name) => [name, (...args: unknown[]) => call(name, ...args)])) as unknown as CustomerCalls & CustomerPages & CustomerAdmin;
  };

  const SLUG = /^[a-z0-9][a-z0-9-]{0,62}$/;

  /** The API the lifecycle calls (ADR-0017). Each call is safe to repeat. */
  class Access extends WorkerEntrypoint<ContentEnv> {
    /** Makes the customer, if it is new, with the person who paid as a user, who can then sign in to it. */
    async provision(customer: string, person: string, billing: string): Promise<void> {
      if (!SLUG.test(customer)) throw new Error('A customer is named by a slug');
      await customerFor(this.env, customer).provision(person, billing);
      await this.env.ISSUER?.addCustomer(person, customer);
    }

    async access(customer: string, access: 'trial' | 'active' | 'lapsed'): Promise<void> {
      if (!SLUG.test(customer)) throw new Error('A customer is named by a slug');
      await customerFor(this.env, customer).setAccess(access);
    }
  }

  /**
   * Makes a customer for a person whose proven address is activated, in ACTIVATED_EMAILS or on the
   * site's waitlist, with them as its first user.
   */
  const activation = (env: ContentEnv) => {
    const issuer = env.ISSUER;
    const activated = activatedEmails(env);
    const lifecycle = env.LIFECYCLE;
    if (!issuer || (activated.size === 0 && !lifecycle)) return undefined;
    return async (person: string): Promise<string | undefined> => {
      const email = await issuer.email(person);
      if (!email) return undefined;
      if (!activated.has(email.toLowerCase()) && !(lifecycle && await waitlistActivated(lifecycle, email))) return undefined;
      const slug = await activatedSlug(person);
      await customerFor(env, slug).addUser(person);
      await issuer.addCustomer(person, slug);
      return slug;
    };
  };

  const worker = {
    async fetch(request: Request, env: ContentEnv): Promise<Response> {
      const handle = createContentServer({
        issuer: env.ISSUER_URL,
        audience: env.AUDIENCE,
        tokens: options.tokens(env),
        customer: (slug) => customerFor(env, slug),
        customersOf: env.ISSUER ? (person) => env.ISSUER!.customers(person) : undefined,
        billing: lifecycleBilling(env),
        activate: activation(env),
        ...(env.TERMS_URL && env.TERMS_VERSION ? { terms: { url: env.TERMS_URL, version: env.TERMS_VERSION } } : {}),
        account: accountFor(env),
      });
      return handle(request);
    },
  };

  return { worker, Customer: Customer as CustomerClass, Access: Access as AccessEntrypoint };
}
