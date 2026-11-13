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
// binding. A person whose proven email address is in ACTIVATED_EMAILS, or whom a user of the brand
// WAITLIST_CUSTOMER names, CMOkit's own, activated on that brand's waitlist, by that address or by the
// Instagram handle they proved and then signed in with (ADR-0048), becomes CMOkit's customer
// at their first call, with no checkout: the server makes their first brand, with them as its first
// user (CUS-03, ADR-0043). On the account page they add more brands (ADR-0042), and each brand runs a
// waitlist of its own that any page on its sites joins (ADR-0043); the JOINS rate limit, when bound,
// slows joins from one address. With INSTAGRAM_APP_ID, INSTAGRAM_APP_SECRET and INSTAGRAM_CONFIG_ID, a
// brand connects its Instagram, and people on its waitlist comment their code on its Reels (ADR-0045). The only host-specific code in the content server lives here.

import { WorkerEntrypoint } from 'cloudflare:workers';
import { fontResponse, type Fonts } from '@cmokit/issuer/look';
import { Customer as CustomerLogic, Refusal } from './customer.ts';
import { createContentServer, type AccountOptions, type Apps, type Billing, type CustomerPages, type Portal, type Tokens } from './index.ts';
import { instagramApp, type InstagramApp } from './instagram.ts';
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
   * spaces. A person whose proven address is one of them becomes CMOkit's customer at their first
   * call, with a first brand made for them. A variable.
   */
  ACTIVATED_EMAILS?: string;
  /** Where the terms every user accepts are published, as a closed beta's (ADR-0047). The issuer reads the same variable. A variable. */
  TERMS_URL?: string;
  /** The terms' current version; a user accepts each new version. A variable. */
  TERMS_VERSION?: string;
  /** Where the account page is served, as https://app.cmokit.ai; no account page without it (ADR-0041). A variable. */
  APP_URL?: string;
  /**
   * The slug of the brand, CMOkit's own, whose waitlist lets people use CMOkit: a person activated on
   * it becomes CMOkit's customer at their first call (ADR-0043). A variable.
   */
  WAITLIST_CUSTOMER?: string;
  /** The Meta app's ID, from App settings > Basic (ADR-0045). A variable. */
  INSTAGRAM_APP_ID?: string;
  /** The Meta app's secret, from the same page. A secret. */
  INSTAGRAM_APP_SECRET?: string;
  /** The Facebook Login for Business configuration under API setup with Unified login. A variable. */
  INSTAGRAM_CONFIG_ID?: string;
  /** A Workers rate limit, keyed by the joining visitor's address, that slows joins to waitlists. */
  JOINS?: { limit(options: { key: string }): Promise<{ success: boolean }> };
}

/** What CMOkit's issuer offers the content server over its service binding. */
export interface IssuerBinding {
  /** The issuer's own routes, as its token endpoint, which the account page signs in through. */
  fetch?(input: string, init?: RequestInit): Promise<Response>;
  validateToken(resource: string, token: string): Promise<{ userId: string; audience: string; props: { person: string; customer: string | null; terms?: string } } | null>;
  /** The customers a person is a user of. */
  customers(person: string): Promise<string[]>;
  /** The customers a person is a user of, each with the name the person gave it, if any. */
  brands(person: string): Promise<{ slug: string; name: string | null }[]>;
  addCustomer(person: string, customer: string, name?: string): Promise<void>;
  /** Names, or renames, one of a person's customers, as they see it; false when it is not theirs. */
  nameCustomer(person: string, customer: string, name: string): Promise<boolean>;
  /** The email address a person proved when signing in, if any. */
  email(person: string): Promise<string | null>;
  /** The Instagram account a person last signed in with, if any (ADR-0048). */
  instagram?(person: string): Promise<{ id: string; handle: string } | null>;
}

// The lifecycle's own routes, as @cmokit/cli names them; the content server does not depend on it.
const LIFECYCLE_ORIGIN = 'https://lifecycle.internal';
const LIFECYCLE_CHECKOUT = '/internal/checkout';
const LIFECYCLE_PORTAL = '/internal/portal';

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

/** A new brand's slug, from its name, with a random end so two brands of one name never meet. */
export function brandSlug(name: string): string {
  const base = name.normalize('NFKD').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/, '');
  const end = [...crypto.getRandomValues(new Uint8Array(3))].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${base || 'brand'}-${end}`;
}

/** The Instagram app, sending brands back to the account page, when its ID, secret and configuration are set. */
export function instagramFor(env: ContentEnv): InstagramApp | undefined {
  const appId = env.INSTAGRAM_APP_ID?.trim();
  const appSecret = env.INSTAGRAM_APP_SECRET?.trim();
  const configId = env.INSTAGRAM_CONFIG_ID?.trim();
  if (!appId || !appSecret || !configId || !env.APP_URL) return undefined;
  return instagramApp({ appId, appSecret, configId, redirectUri: `${new URL(env.APP_URL).origin}/instagram/callback` });
}

/** The addresses in ACTIVATED_EMAILS, in lower case. */
export function activatedEmails(env: ContentEnv): Set<string> {
  return new Set((env.ACTIVATED_EMAILS ?? '').split(/[\s,]+/).map((a) => a.trim().toLowerCase()).filter(Boolean));
}

/** An activated person's first brand's slug, the same every time, so activating them twice makes one brand. */
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
      const terms = valid.props?.terms;
      return { person: valid.userId, audience: valid.audience, customer: valid.props?.customer ?? undefined, ...(terms ? { terms } : {}) };
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
  'access', 'billing', 'linkFor', 'connect', 'termsAccepted', 'termsRecord', 'termsLink', 'termsFor', 'acceptTerms', 'provision', 'setAccess', 'addUser', 'exportAll',
  'claudeSeen', 'claudeConnected',
  'waitlistSites', 'waitlistSetSites', 'waitlistJoin', 'waitlistList', 'waitlistActivate', 'waitlistDecline', 'waitlistActivated', 'waitlistActivatedInstagram',
  'funnelVisit', 'funnelRead',
  'instagramStart', 'instagramTake', 'instagramSave', 'instagramAccount', 'instagramCount', 'instagramDisconnect'] as const;
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
    ...(issuer.instagram ? { handle: async (person: string) => (await issuer.instagram!(person))?.handle ?? null } : {}),
  };
}

/**
 * `fonts` are the pages' two fonts, served at `/fonts/`; without them the pages use the system font (ADR-0046).
 * `apps` are the built cards Claude shows beside a tool's result; without them the tools answer in text alone (ADR-0049).
 * `portal` is the built account page (ADR-0051); without it the account origin serves no page.
 */
export function createContentWorker(options: { tokens(env: ContentEnv): Tokens; fonts?: Fonts; apps?: Apps; portal?: Portal }) {
  class Customer {
    readonly #logic: CustomerLogic;

    constructor(ctx: DurableObjectState, env: ContentEnv) {
      const sql: Sql = { all: (query, ...params) => ctx.storage.sql.exec(query, ...params).toArray() };
      const instagram = instagramFor(env);
      this.#logic = new CustomerLogic(sql, { vault: aesGcmVault(env.CREDENTIAL_KEY), events: luma(), ...(instagram ? { instagram } : {}) });
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

  type CustomerAdmin = Pick<CustomerLogic, 'provision' | 'setAccess' | 'addUser' | 'waitlistActivated' | 'waitlistActivatedInstagram'>;
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
   * waitlist of the brand WAITLIST_CUSTOMER names, or who signed in with the Instagram account whose
   * handle a person activated on that waitlist proved (ADR-0048), with them as its first user.
   */
  const activation = (env: ContentEnv) => {
    const issuer = env.ISSUER;
    const activated = activatedEmails(env);
    const owner = env.WAITLIST_CUSTOMER?.trim();
    if (!issuer || (activated.size === 0 && !owner)) return undefined;
    return async (person: string): Promise<string | undefined> => {
      const email = await issuer.email(person);
      const byEmail = Boolean(email) && (activated.has(email!.toLowerCase()) || Boolean(owner && await customerFor(env, owner).waitlistActivated(email!)));
      if (!byEmail) {
        const instagram = owner && issuer.instagram ? await issuer.instagram(person) : null;
        if (!instagram || !(await customerFor(env, owner!).waitlistActivatedInstagram(instagram.id, instagram.handle))) return undefined;
      }
      const slug = await activatedSlug(person);
      await customerFor(env, slug).addUser(person);
      await issuer.addCustomer(person, slug);
      return slug;
    };
  };

  /** Any user of a brand adds another, with no cap during the closed beta (ADR-0042). */
  const accountWith = (env: ContentEnv): AccountOptions | undefined => {
    const account = accountFor(env);
    const issuer = env.ISSUER;
    if (!account || !issuer) return account;
    return {
      ...account,
      async addBrand(person, name) {
        const slug = brandSlug(name);
        await customerFor(env, slug).addUser(person);
        await issuer.addCustomer(person, slug, name);
        return slug;
      },
      brands: (person) => issuer.brands(person),
      async renameBrand(person, slug, name) {
        await issuer.nameCustomer(person, slug, name);
      },
      ...(env.WAITLIST_CUSTOMER?.trim() ? { cmokitWaitlist: env.WAITLIST_CUSTOMER.trim() } : {}),
    };
  };

  const worker = {
    async fetch(request: Request, env: ContentEnv): Promise<Response> {
      const font = fontResponse(request, options.fonts);
      if (font) return font;
      const handle = createContentServer({
        issuer: env.ISSUER_URL,
        audience: env.AUDIENCE,
        tokens: options.tokens(env),
        customer: (slug) => customerFor(env, slug),
        customersOf: env.ISSUER ? (person) => env.ISSUER!.customers(person) : undefined,
        billing: lifecycleBilling(env),
        activate: activation(env),
        ...(env.TERMS_URL && env.TERMS_VERSION ? { terms: { url: env.TERMS_URL, version: env.TERMS_VERSION } } : {}),
        account: accountWith(env),
        join: { allow: env.JOINS ? async (key) => (await env.JOINS!.limit({ key })).success : undefined },
        instagram: instagramFor(env),
        apps: options.apps,
        ...(options.portal ? { portal: options.portal } : {}),
      });
      return handle(request);
    },
  };

  return { worker, Customer: Customer as CustomerClass, Access: Access as AccessEntrypoint };
}
