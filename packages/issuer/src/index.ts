// CMOkit's issuer (ADR-0018): the sign-in a person's Claude sends them to when it connects to the
// content server. It signs a person in with an email code, Google, GitHub or Meta, keeps no password,
// and finishes the authorization with a grant that names the person and the customer the connection
// serves, chosen here: the content plugin declares one hosted address, and signing in routes the
// person to their customer's records (ADR-0029). A person who is no customer's user yet is still
// signed in, with a grant that names no customer, so they can start a subscription (ADR-0017). The
// protocol itself (client registration, PKCE,
// codes, tokens, their storage) is the OAuth library's, wired in worker.ts (ADR-0035); this handler
// owns only the sign-in pages and uses the web-standard Request and Response alone (ADR-0003).

import { choosePage, codePage, problemPage, signInPage, type ClientFacts } from './pages.ts';
import type { Provider } from './providers.ts';
import { SENDS_PER_NETWORK, type CodeCheck } from './accounts.ts';

export { CODE_ATTEMPTS, CODE_LIFETIME, Identity, Person, SENDS_PER_ADDRESS, SENDS_PER_NETWORK, type CodeCheck } from './accounts.ts';
export { github, google, meta, type Provider, type ProviderClient, type Signed } from './providers.ts';
export type { Row, Sql } from './sql.ts';

/** The authorization request as the OAuth library parsed it; this handler reads only these fields. */
export interface AuthRequest {
  clientId: string;
  redirectUri: string;
  scope: string[];
}

/** The OAuth library's helpers this handler calls. */
export interface SignInOAuth<R extends AuthRequest = AuthRequest> {
  parseAuthRequest(request: Request): Promise<R>;
  lookupClient(clientId: string): Promise<{ redirectUris: string[] } | null>;
  describeConsent(request: R): Promise<ClientFacts>;
  beginConsent(request: R): Promise<{ handle: string; headers: Headers }>;
  approveConsent(request: Request, handle: string): Promise<{ request: R; headers: Headers }>;
  denyConsent(request: Request, handle: string): Promise<{ headers: Headers }>;
  beginUpstream(request: R, options: { data: unknown; headers?: Headers }): Promise<{ state: string; headers: Headers }>;
  finishUpstream<D>(request: Request): Promise<{ request: R; data: D; headers: Headers }>;
  completeAuthorization(options: { request: R; userId: string; metadata: object; scope: string[]; props: Grant }): Promise<{ redirectTo: string }>;
  /** The redirect back to the client that tells it the person declined. */
  declined(request: R): string;
}

/** What a grant carries, encrypted by the library, and what the content server's token check returns. */
export interface Grant {
  person: string;
  /** The slug of the customer this connection serves, or null for a person who had none at sign-in. */
  customer: string | null;
}

export interface IdentityRecords {
  person(): Promise<string | null>;
  claim(person: string): Promise<string>;
  allow(limit: number, now: number): Promise<boolean>;
  issueCode(now: number): Promise<string | undefined>;
  checkCode(code: string, now: number): Promise<CodeCheck>;
}

export interface PersonRecords {
  addIdentity(name: string, email: string | null, now: number): Promise<void>;
  email(): Promise<string | null>;
  customers(): Promise<string[]>;
  addCustomer(slug: string, now: number): Promise<void>;
}

/** The issuer's records, each in an object of its own (ADR-0030). */
export interface Accounts {
  identity(name: string): IdentityRecords;
  person(id: string): PersonRecords;
}

/** Sends a sign-in code. It is transactional mail, in no unsubscribe group (ADR-0018). */
export interface CodeMail {
  sendCode(to: string, code: string): Promise<void>;
}

export interface SignInOptions<R extends AuthRequest> {
  /** The issuer's own address; providers send the person back to `<issuer>/callback`. */
  issuer: string;
  oauth: SignInOAuth<R>;
  accounts: Accounts;
  /** Sends email codes, or undefined when email sign-in is not set up. */
  mail?: CodeMail;
  providers: Provider[];
  /** The network a request came from, for the limit on codes sent. */
  network(request: Request): string;
  now?(): number;
  /** Redirects allowed beside Claude's callback and loopback, as the account page's callback (ADR-0041). */
  redirects?: readonly string[];
}

/**
 * The redirects a client may name: Claude's callback over https, a loopback address over http
 * (ADR-0018), or one this deployment names for its own account page (ADR-0041).
 */
export const CLAUDE_CALLBACK = 'https://claude.ai/api/mcp/auth_callback';

export function allowedRedirect(uri: string, extra: readonly string[] = []): boolean {
  if (uri === CLAUDE_CALLBACK || extra.includes(uri)) return true;
  let url: URL;
  try {
    url = new URL(uri);
  } catch {
    return false;
  }
  return url.protocol === 'http:' && ['127.0.0.1', '[::1]', 'localhost'].includes(url.hostname) && !url.username && !url.password && !url.hash;
}

const ADDRESS = /^[^\s@<>()",;:\\[\]]+@[^\s@<>()",;:\\[\]]+\.[^\s@<>()",;:\\[\]]+$/;

type Upstream =
  | { way: 'google' | 'github' | 'meta'; verifier: string }
  | { way: 'email'; address: string }
  | { way: 'choose'; person: string; customers: string[] };

function base64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function challengeFor(verifier: string): Promise<string> {
  return base64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));
}

function merge(...all: Headers[]): Headers {
  const merged = new Headers();
  for (const headers of all) {
    for (const [name, value] of headers) {
      if (name === 'set-cookie') continue;
      merged.set(name, value);
    }
    for (const cookie of headers.getSetCookie()) merged.append('set-cookie', cookie);
  }
  return merged;
}

function redirect(location: string, headers: Headers): Response {
  headers.set('location', location);
  return new Response(null, { status: 302, headers });
}

export function createSignIn<R extends AuthRequest>(options: SignInOptions<R>) {
  const { oauth, accounts } = options;
  const now = options.now ?? Date.now;
  const callback = `${options.issuer.replace(/\/$/, '')}/callback`;
  const ways = options.providers.map((p) => ({ name: p.name, label: p.label }));

  async function signIn(request: R, headers: Headers, problem?: string): Promise<Response> {
    const client = await oauth.describeConsent(request);
    const consent = await oauth.beginConsent(request);
    return signInPage({ client, handle: consent.handle, ways, email: Boolean(options.mail), problem, headers: merge(headers, consent.headers) });
  }

  async function start(request: Request): Promise<Response> {
    const parsed = await oauth.parseAuthRequest(request);
    const client = await oauth.lookupClient(parsed.clientId);
    if (!client || !client.redirectUris.every((uri) => allowedRedirect(uri, options.redirects))) {
      return problemPage('This app sends sign-ins somewhere CMOkit does not allow, so it cannot connect.');
    }
    return signIn(parsed, new Headers());
  }

  async function chooseWay(request: Request): Promise<Response> {
    const form = await request.formData();
    const handle = String(form.get('handle') ?? '');
    const way = String(form.get('way') ?? '');
    if (way === 'cancel') return new Response(null, { status: 302, headers: (await oauth.denyConsent(request, handle)).headers });
    const approved = await oauth.approveConsent(request, handle);

    const provider = options.providers.find((p) => p.name === way);
    if (provider) {
      const verifier = base64url(crypto.getRandomValues(new Uint8Array(32)));
      const upstream = await oauth.beginUpstream(approved.request, { data: { way: provider.name, verifier } satisfies Upstream, headers: approved.headers });
      return redirect(provider.authorizeUrl({ state: upstream.state, challenge: await challengeFor(verifier), redirectUri: callback }), upstream.headers);
    }

    if (way === 'email' && options.mail) {
      const address = String(form.get('address') ?? '').trim().toLowerCase();
      if (!ADDRESS.test(address) || address.length > 254) return signIn(approved.request, approved.headers, 'That email address does not look right.');
      const at = now();
      const allowed = await accounts.identity(`network:${options.network(request)}`).allow(SENDS_PER_NETWORK, at);
      const code = allowed ? await accounts.identity(`email:${address}`).issueCode(at) : undefined;
      if (!code) return signIn(approved.request, approved.headers, 'Too many codes were sent. Try again in an hour, or use another way in.');
      await options.mail.sendCode(address, code);
      const upstream = await oauth.beginUpstream(approved.request, { data: { way: 'email', address } satisfies Upstream, headers: approved.headers });
      return codePage({ address, state: upstream.state, headers: upstream.headers });
    }

    return signIn(approved.request, approved.headers, 'Choose a way to sign in.');
  }

  async function enterCode(request: Request): Promise<Response> {
    const resumed = await oauth.finishUpstream<Upstream>(request);
    if (resumed.data.way !== 'email') return problemPage('This page expired.');
    const { address } = resumed.data;
    const code = String((await request.formData()).get('code') ?? '');
    const checked = await accounts.identity(`email:${address}`).checkCode(code, now());
    if (checked === 'ok') return signedIn(resumed.request, `email:${address}`, address, resumed.headers);
    if (checked === 'wrong') {
      const again = await oauth.beginUpstream(resumed.request, { data: resumed.data, headers: resumed.headers });
      return codePage({ address, state: again.state, problem: "That code doesn't match. Check it and try again.", headers: again.headers });
    }
    return signIn(resumed.request, resumed.headers, 'That code expired or was tried too many times. Ask for a new one.');
  }

  async function returned(request: Request): Promise<Response> {
    const resumed = await oauth.finishUpstream<Upstream>(request);
    const provider = options.providers.find((p) => p.name === resumed.data.way);
    if (!provider || resumed.data.way === 'email' || resumed.data.way === 'choose') return problemPage('This page expired.');
    const params = new URL(request.url).searchParams;
    const code = params.get('code');
    if (params.get('error') || !code) return redirect(oauth.declined(resumed.request), resumed.headers);
    let signed;
    try {
      signed = await provider.identify({ code, verifier: resumed.data.verifier, redirectUri: callback });
    } catch {
      return problemPage(`Signing in with ${provider.label} didn't work.`, 502, resumed.headers);
    }
    return signedIn(resumed.request, `${provider.name}:${signed.subject}`, signed.email, resumed.headers);
  }

  /** Finds or makes the person an identity belongs to, then routes them to their customer. */
  async function signedIn(request: R, identity: string, email: string | null, headers: Headers): Promise<Response> {
    const person = await accounts.identity(identity).claim(crypto.randomUUID());
    const records = accounts.person(person);
    await records.addIdentity(identity, email, now());
    const customers = await records.customers();
    if (customers.length === 0) return complete(request, person, null, headers);
    if (customers.length === 1) return complete(request, person, customers[0], headers);
    const upstream = await oauth.beginUpstream(request, { data: { way: 'choose', person, customers } satisfies Upstream, headers });
    return choosePage({ customers, state: upstream.state, headers: upstream.headers });
  }

  async function chose(request: Request): Promise<Response> {
    const resumed = await oauth.finishUpstream<Upstream>(request);
    if (resumed.data.way !== 'choose') return problemPage('This page expired.');
    const customer = String((await request.formData()).get('customer') ?? '');
    if (!resumed.data.customers.includes(customer)) return problemPage('That customer is not one of yours.');
    return complete(resumed.request, resumed.data.person, customer, resumed.headers);
  }

  async function complete(request: R, person: string, customer: string | null, headers: Headers): Promise<Response> {
    const { redirectTo } = await oauth.completeAuthorization({ request, userId: person, metadata: {}, scope: request.scope, props: { person, customer } });
    return redirect(redirectTo, headers);
  }

  const routes: Record<string, (request: Request) => Promise<Response>> = {
    'GET /authorize': start,
    'POST /authorize': chooseWay,
    'POST /code': enterCode,
    'GET /callback': returned,
    'POST /choose': chose,
  };

  /** Answers the sign-in's own routes, and undefined for everything the OAuth library serves. */
  return async function handle(request: Request): Promise<Response | undefined> {
    const route = routes[`${request.method} ${new URL(request.url).pathname}`];
    if (!route) return undefined;
    try {
      return await route(request);
    } catch (error) {
      const e = error as { name?: string; redirectTo?: string; description?: string };
      if (e.name === 'AuthorizationError') {
        if (e.redirectTo) return Response.redirect(e.redirectTo, 302);
        return problemPage(e.description ?? 'This sign-in is not valid.');
      }
      if (e.name === 'CimdFetchError') return problemPage('This app could not be verified.');
      throw error;
    }
  };
}
