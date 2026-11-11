// The content server (ADR-0029): CMOkit's remote MCP server for the content plugin, serving MCP over
// Streamable HTTP with no session, and the one-time pages that take a key (ADR-0019). Each customer
// has its own path, `/customers/<slug>/mcp`. The content plugin declares one hosted address, with the
// path `/mcp`, and a call there is routed to the customer the person chose when signing in, which the
// issuer's grant names. It issues no token: it names its issuer in Protected Resource Metadata and
// accepts only tokens the issuer issued for its audience, for a person who is a user of the customer
// served (HST-10). A person who had no customer when they signed in is served the one they have now;
// a person with none is offered only account_status, whose link starts a subscription (ADR-0017),
// unless they were activated without a checkout, as in a closed beta: then their first call makes
// their customer, with them as its first user (CUS-03). A customer whose access has lapsed keeps
// account_status and nothing else. When the server has terms, as a closed beta's, a user who has not
// accepted their current version is offered account_status alone too, whose link opens the page to
// accept them (ADR-0039). Any page on a site a brand's users listed adds people to that brand's
// waitlist at /join/<slug>, with no Worker of the site's own (ADR-0043). Handlers use the web-standard Request and Response only (ADR-0003); the Worker that
// wires the customer's Durable Object, the vault and the event platform's adapter is worker.ts.

import { handleAccount, isAccountPath, type AccountOptions } from './account.ts';
import { Refusal, type InstagramAccount, type InstagramStart, type WaitlistDetails, type WaitlistEntry, type WaitlistJoined } from './customer.ts';
import type { InstagramApp } from './instagram.ts';
import { handleJoin, type JoinOptions } from './join.ts';
import { acceptedPage, donePage, gonePage, keyPage, subscriptionPage, termsPage } from './pages.ts';
import { INSTRUCTIONS, TOOLS, type CustomerCalls, type Tool } from './tools.ts';

export type { AccountOptions } from './account.ts';
export { Customer, Refusal, SECTIONS, type BrandContext, type CustomerDeps, type Offer, type Piece, type InstagramAccount, type InstagramStart, type WaitlistDetails, type WaitlistEntry, type WaitlistJoined } from './customer.ts';
export { instagramApp, InstagramError, type InstagramApp, type InstagramOptions, type ReelComment } from './instagram.ts';
export { joinSnippet, type JoinOptions } from './join.ts';
export { tally, type EventSummary, type Events, type GuestFacts, type Tally } from './events.ts';
export { PLATFORMS, trackedLink, type Platform } from './links.ts';
export type { Row, Sql } from './sql.ts';
export { TOOLS, type CustomerCalls, type Tool } from './tools.ts';
export { aesGcmVault, type Vault } from './vault.ts';

/** Checks a bearer token with the issuer that issued it. */
export interface Tokens {
  /**
   * The person the token names, the audience it was issued for and the customer chosen when signing
   * in, or undefined when it is not valid.
   */
  check(token: string): Promise<{ person: string; audience: string; customer?: string } | undefined>;
}

/** What the one-time pages call on a customer's records. */
export interface CustomerPages {
  linkFor(token: string): Promise<{ vendor: string; label: string; help: string } | undefined>;
  connect(token: string, key: string): Promise<{ ok: true; calendar: string } | { ok: false; problem: string }>;
  termsAccepted(person: string, version: string): Promise<boolean>;
  termsLink(person: string): Promise<{ token: string; expires: string }>;
  termsFor(token: string): Promise<boolean>;
  acceptTerms(token: string, version: string): Promise<boolean>;
  /** Everything held for the customer, for the person to download (HST-13). */
  exportAll(): Promise<{ json: string; markdown: string }>;
  /** The brand's waitlist and the site addresses allowed to join it (ADR-0043). */
  waitlistSites(): Promise<string[]>;
  waitlistSetSites(sites: string[]): Promise<string[]>;
  waitlistJoin(email: string, details?: WaitlistDetails): Promise<WaitlistJoined>;
  waitlistList(): Promise<WaitlistEntry[]>;
  waitlistActivate(email: string): Promise<{ found: boolean }>;
  /** Connecting the brand's Instagram, and counting comments on its Reels (ADR-0045). */
  instagramStart(person: string): Promise<string>;
  instagramTake(token: string): Promise<InstagramStart | undefined>;
  instagramSave(person: string, id: string, username: string, token: string): Promise<void>;
  instagramAccount(): Promise<InstagramAccount | null>;
  instagramCount(): Promise<{ reels: number; people: number }>;
}

/** Terms every user accepts before using the server, as a closed beta's (ADR-0039). */
export interface Terms {
  /** Where the terms are published. */
  url: string;
  /** Their current version; a new version is accepted again. */
  version: string;
}

/** The lifecycle's links for a hosted customer's subscription (ADR-0017). */
export interface Billing {
  /** A checkout link that starts a trial and makes a customer with the person as its first user. */
  checkout(person: string, returnTo: { successUrl: string; cancelUrl: string }): Promise<string>;
  /** A link to the customer's subscription portal. */
  portal(billing: string, returnUrl: string): Promise<string>;
}

export interface ContentServerOptions {
  /** The issuer's address, named in Protected Resource Metadata. */
  issuer: string;
  /** The audience the issuer issues the content server's tokens for. */
  audience: string;
  tokens: Tokens;
  /** The records of the customer whose slug the address names. */
  customer(slug: string): CustomerCalls & CustomerPages;
  /** The customers a person is a user of, for a token that names none. */
  customersOf?(person: string): Promise<string[]>;
  /** Absent when this server sells no subscription, as when it is self-hosted. */
  billing?: Billing;
  /**
   * Makes a customer, with the person as its first user, for a person activated without a checkout,
   * and returns its slug; undefined for anyone else. Safe to repeat for the same person.
   */
  activate?(person: string): Promise<string | undefined>;
  /** Absent when users accept no terms on this server, as when it is self-hosted. */
  terms?: Terms;
  /** The account page, at an origin of its own; absent when this server serves none (ADR-0041). */
  account?: AccountOptions;
  /** How joins to a brand's waitlist are slowed; absent, none are (ADR-0043). */
  join?: JoinOptions;
  /**
   * The Instagram app, whose redirect address is the account page's /instagram/callback; absent, no
   * brand connects Instagram and the waitlist form offers no Instagram step (ADR-0045). It needs the
   * account page.
   */
  instagram?: InstagramApp;
}

const LAPSED = "This customer's subscription has lapsed, so its records are closed until it is paid. "
  + 'account_status has the link to manage the subscription.';

const VERSIONS = ['2026-07-28', '2025-11-25', '2025-06-18', '2025-03-26'];
const SLUG = '([a-z0-9][a-z0-9-]{0,62})';
const MCP = new RegExp(`^/customers/${SLUG}/mcp$`);
const METADATA = new RegExp(`^/\\.well-known/oauth-protected-resource/customers/${SLUG}/mcp$`);
const ONE_SLUG = new RegExp(`^${SLUG}$`);
const HOSTED = '/mcp';
const HOSTED_METADATA = '/.well-known/oauth-protected-resource/mcp';
const CONNECT = new RegExp(`^/customers/${SLUG}/connect$`);
const TERMS_PAGE = new RegExp(`^/customers/${SLUG}/terms$`);
const UNACCEPTED = 'Accept CMOkit\'s beta terms first. Call account_status for the link to read and accept them.';
const SUBSCRIPTION = '/subscription';
const JOIN = new RegExp(`^/join/${SLUG}$`);
const INSTAGRAM_CALLBACK = '/instagram/callback';
/** The value Meta hands back names the brand, so one redirect address serves every brand. */
const INSTAGRAM_STATE = new RegExp(`^${SLUG}\\.([A-Za-z0-9_-]{32})$`);
const instagramState = (slug: string, token: string) => `${slug}.${token}`;
const AMBIGUOUS = 'This account has more than one brand. Sign in again to choose one.';

/** A sign-in that names no one customer. */
class Ambiguous extends Error {}

type Message = { jsonrpc?: string; id?: string | number | null; method?: string; params?: Record<string, any> };

export function createContentServer(options: ContentServerOptions) {
  return async function handle(request: Request): Promise<Response> {
    const url = new URL(request.url);
    let match: RegExpMatchArray | null;

    // The customer a sign-in serves at the hosted address: the one the person chose when signing in,
    // or, when they had none then, the one they have now, or one made for them when activated.
    const served = async (checked: { person: string; customer?: string }): Promise<string | undefined> => {
      if (checked.customer !== undefined) return checked.customer;
      const customers = options.customersOf ? await options.customersOf(checked.person) : [];
      if (customers.length > 1) throw new Ambiguous();
      return customers[0] ?? (options.activate ? await options.activate(checked.person) : undefined);
    };

    const { account } = options;
    const instagram = account ? options.instagram : undefined;
    if (instagram && url.origin === account!.origin && url.pathname === INSTAGRAM_CALLBACK && request.method === 'GET') {
      return instagramCallback(url, instagram, options.customer, account!.origin);
    }
    if (account && url.origin === account.origin && isAccountPath(url.pathname)) {
      try {
        return await handleAccount(request, url, account, {
          issuer: options.issuer, audience: options.audience, tokens: options.tokens, billing: options.billing, terms: options.terms,
          customer: options.customer,
          ...(instagram ? { instagram: { app: instagram, state: instagramState } } : {}),
          served: async (checked) => {
            const slug = await served(checked);
            if (slug !== undefined && !ONE_SLUG.test(slug)) throw new Ambiguous();
            return slug;
          },
        });
      } catch (error) {
        // A sign-in made before the person had several brands names none of them: signing in again
        // asks which brand to show.
        if (error instanceof Ambiguous) return new Response(null, { status: 303, headers: { location: '/signin' } });
        throw error;
      }
    }

    if ((match = url.pathname.match(METADATA))) return metadata(request, `${url.origin}/customers/${match[1]}/mcp`, options.issuer);
    if (url.pathname === HOSTED_METADATA) return metadata(request, `${url.origin}${HOSTED}`, options.issuer);

    if ((match = url.pathname.match(CONNECT))) return connectPage(request, url, options.customer(match[1]));
    if ((match = url.pathname.match(TERMS_PAGE))) {
      return options.terms ? acceptPage(request, url, options.customer(match[1]), options.terms) : new Response('Not found', { status: 404 });
    }
    if (url.pathname === SUBSCRIPTION && request.method === 'GET') return subscriptionPage(url.searchParams.get('s') ?? '');
    if ((match = url.pathname.match(JOIN))) {
      const slug = match[1];
      const customer = options.customer(slug);
      // The form's Instagram step names the brand's account, so it shows only while an app is set up.
      return handleJoin(request, instagram ? customer : {
        waitlistSites: () => customer.waitlistSites(), waitlistJoin: (email, details) => customer.waitlistJoin(email, details),
      }, options.join);
    }

    const slug = url.pathname.match(MCP)?.[1];
    if (slug !== undefined || url.pathname === HOSTED) {
      if (request.method !== 'POST') return new Response(null, { status: 405, headers: { allow: 'POST' } });
      const challenge = () => new Response(null, {
        status: 401,
        headers: { 'www-authenticate': `Bearer resource_metadata="${url.origin}/.well-known/oauth-protected-resource${url.pathname}"` },
      });
      const token = request.headers.get('authorization')?.match(/^Bearer (\S+)$/i)?.[1];
      if (!token) return challenge();
      const checked = await options.tokens.check(token);
      if (!checked || checked.audience !== options.audience) return challenge();
      // At the hosted address, the customer is the one the person chose when signing in, or, when
      // they had none then, the one they have now.
      let chosen: string | undefined;
      try {
        chosen = slug ?? await served(checked);
      } catch (error) {
        if (error instanceof Ambiguous) return new Response(AMBIGUOUS, { status: 403 });
        throw error;
      }
      if (chosen !== undefined && !ONE_SLUG.test(chosen)) return new Response('This sign-in names no customer. Sign in again.', { status: 403 });
      const customer = chosen === undefined ? undefined : options.customer(chosen);
      if (customer && !(await customer.isUser(checked.person))) {
        return new Response('This account is not a user of this customer.', { status: 403 });
      }
      let message: Message;
      try {
        message = await request.json() as Message;
      } catch {
        return Response.json(failure(null, -32700, 'Parse error'), { status: 400 });
      }
      if (Array.isArray(message) || typeof message !== 'object' || message === null) {
        return Response.json(failure(null, -32600, 'Send one JSON-RPC message per request'), { status: 400 });
      }
      if (message.id === undefined) return new Response(null, { status: 202 });
      const back = (state: string) => `${url.origin}${SUBSCRIPTION}?s=${state}`;
      if (!customer) return Response.json(await respondUnsubscribed(message, checked.person, options.billing, back));
      const { billing } = options;
      const manage = billing ? async () => {
        const held = await customer.billing();
        return held ? billing.portal(held, back('managed')) : undefined;
      } : undefined;
      const base = `${url.origin}/customers/${chosen}`;
      const { terms } = options;
      const unaccepted = terms && !(await customer.termsAccepted(checked.person, terms.version)) ? async () => {
        const { token, expires } = await customer.termsLink(checked.person);
        return { what: 'terms', label: 'CMOkit beta terms', terms: terms.url, link: `${base}/terms?t=${token}`, expires };
      } : undefined;
      const answer = await respond(message, { person: checked.person, base, customer }, manage, unaccepted);
      return Response.json(answer);
    }

    return new Response('Not found', { status: 404 });
  };
}

function metadata(request: Request, resource: string, issuer: string): Response {
  if (request.method !== 'GET') return new Response(null, { status: 405, headers: { allow: 'GET' } });
  return Response.json({ resource, authorization_servers: [issuer], bearer_methods_supported: ['header'], resource_name: 'CMOkit' });
}

function initialized(id: string | number | null, params: Record<string, any>) {
  const asked = params.protocolVersion;
  return success(id, {
    protocolVersion: VERSIONS.includes(asked) ? asked : VERSIONS[0],
    capabilities: { tools: {} },
    serverInfo: { name: 'cmokit-content', title: 'CMOkit', version: '0.1.0' },
    instructions: INSTRUCTIONS,
  });
}

const listed = (tool: Tool) => { const { call: _call, ...rest } = tool; return rest; };
const result = (id: string | number | null, data: unknown) => {
  const structured = Array.isArray(data) ? { items: data } : data as Record<string, unknown>;
  return success(id, { content: [{ type: 'text', text: JSON.stringify(structured, null, 1) }], structuredContent: structured });
};
const refused = (id: string | number | null, text: string) => success(id, { content: [{ type: 'text', text }], isError: true });

/** A signed-in person who is no customer's user yet: account_status alone, with the link to subscribe. */
async function respondUnsubscribed(message: Message, person: string, billing: Billing | undefined, back: (state: string) => string) {
  const { id = null, method, params = {} } = message;
  const status = TOOLS.find((t) => t.name === 'account_status')!;
  if (method === 'initialize') return initialized(id, params);
  if (method === 'ping') return success(id, {});
  if (method === 'tools/list') return success(id, { tools: [listed(status)] });
  if (method === 'tools/call') {
    if (params.name !== status.name) return refused(id, 'This account has no CMOkit subscription yet. Call account_status for the link to start one.');
    if (!billing) return refused(id, 'This account is not a user of any customer on this server. Ask whoever runs it to add you.');
    const link = await billing.checkout(person, { successUrl: back('started'), cancelUrl: back('cancelled') });
    return result(id, { access: 'none', connections: [], missing: [{ what: 'subscription', label: 'CMOkit', link }] });
  }
  return failure(id, -32601, `Method not found: ${method}`);
}

/**
 * A user's call. `unaccepted` is present while the person has not accepted the server's terms, and
 * makes the missing item that links to the page to accept them.
 */
async function respond(
  message: Message,
  context: { person: string; base: string; customer: CustomerCalls },
  manage?: () => Promise<string | undefined>,
  unaccepted?: () => Promise<Record<string, unknown>>,
) {
  const { id = null, method, params = {} } = message;
  if (method === 'initialize') return initialized(id, params);
  if (method === 'ping') return success(id, {});
  if (method === 'tools/list') return success(id, { tools: (unaccepted ? TOOLS.filter((t) => t.name === 'account_status') : TOOLS).map(listed) });
  if (method === 'tools/call') {
    const tool = TOOLS.find((t) => t.name === params.name);
    if (!tool) return failure(id, -32602, `Unknown tool: ${params.name}`);
    const isStatus = tool.name === 'account_status';
    if (!isStatus && unaccepted) return refused(id, UNACCEPTED);
    if (!isStatus && (await context.customer.access()) === 'lapsed') return refused(id, LAPSED);
    try {
      let data = await tool.call(params.arguments ?? {}, context);
      if (isStatus && unaccepted) {
        const status = data as { missing: unknown[] };
        data = { ...status, missing: [await unaccepted(), ...status.missing] };
      }
      if (isStatus && manage) {
        // The status still answers when the billing portal cannot be reached.
        const link = await manage().catch(() => undefined);
        if (link) return result(id, { ...data as Record<string, unknown>, subscription: { manage: link } });
      }
      return result(id, data);
    } catch (error) {
      if (error instanceof Refusal || (error as Error).name === 'Refusal') {
        return success(id, { content: [{ type: 'text', text: (error as Error).message }], isError: true });
      }
      throw error;
    }
  }
  return failure(id, -32601, `Method not found: ${method}`);
}

/**
 * Where Meta sends a brand's user back after they connected the brand's Instagram. Either way they go
 * back to the account page, which says whether it worked.
 */
async function instagramCallback(url: URL, instagram: InstagramApp, customerOf: ContentServerOptions['customer'], origin: string): Promise<Response> {
  const state = url.searchParams.get('state')?.match(INSTAGRAM_STATE);
  if (!state) return gonePage();
  const customer = customerOf(state[1]);
  const start = await customer.instagramTake(state[2]);
  if (!start) return gonePage();
  const back = (outcome: string) => new Response(null, { status: 303, headers: { location: `${origin}/?instagram=${outcome}` } });
  const code = url.searchParams.get('code');
  if (!code) return back('failed');
  try {
    const connected = await instagram.connect(code);
    await customer.instagramSave(start.person, connected.id, connected.username, connected.token);
  } catch (error) {
    if ((error as Error).name === 'InstagramError') return back('failed');
    throw error;
  }
  return back('connected');
}

async function connectPage(request: Request, url: URL, customer: CustomerPages): Promise<Response> {
  if (request.method === 'GET') {
    const token = url.searchParams.get('t') ?? '';
    const link = token ? await customer.linkFor(token) : undefined;
    if (!link) return gonePage();
    return keyPage({ label: link.label, help: link.help, token });
  }
  if (request.method === 'POST') {
    const form = await request.formData();
    const token = String(form.get('t') ?? '');
    const key = String(form.get('key') ?? '');
    const link = token ? await customer.linkFor(token) : undefined;
    if (!link) return gonePage();
    const result = await customer.connect(token, key);
    return result.ok ? donePage(link.label, result.calendar) : keyPage({ label: link.label, help: link.help, token, problem: result.problem });
  }
  return new Response(null, { status: 405, headers: { allow: 'GET, POST' } });
}

async function acceptPage(request: Request, url: URL, customer: CustomerPages, terms: Terms): Promise<Response> {
  if (request.method === 'GET') {
    const token = url.searchParams.get('t') ?? '';
    if (!token || !(await customer.termsFor(token))) return gonePage();
    return termsPage({ url: terms.url, version: terms.version, token });
  }
  if (request.method === 'POST') {
    const form = await request.formData();
    const token = String(form.get('t') ?? '');
    if (form.get('accept') !== 'yes') return termsPage({ url: terms.url, version: terms.version, token, problem: 'Tick the box to accept the terms.' });
    return token && await customer.acceptTerms(token, terms.version) ? acceptedPage() : gonePage();
  }
  return new Response(null, { status: 405, headers: { allow: 'GET, POST' } });
}

const success = (id: string | number | null, result: object) => ({ jsonrpc: '2.0', id, result });
const failure = (id: string | number | null, code: number, message: string) => ({ jsonrpc: '2.0', id, error: { code, message } });
