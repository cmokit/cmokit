// CMOKit's issuer (ADR-0018): the sign-in a person's Claude sends them to when it connects to the
// content server. It signs a person in with Instagram, an email code, Google, GitHub or Facebook,
// keeps no password, and finishes the authorization with tokens that name the person and the
// customer the connection serves, chosen here: the content plugin declares one hosted address, and
// signing in routes the person to their customer's records (ADR-0029). A person who is no customer's
// user yet is still signed in, with tokens that name no customer, so they can start a subscription
// (ADR-0017). While a deployment asks for beta terms, the sign-in screen has a box to tick before any
// way in, and the version ticked is kept with the person, which the content server keeps with the
// customer (ADR-0047). The protocol itself (client registration, PKCE, codes, tokens, their storage)
// and the providers are Better Auth's, set up in auth.ts (ADR-0035); this module owns only the
// sign-in pages and the records CMOKit keeps beside Better Auth's, and uses the web-standard Request
// and Response alone (ADR-0003).
//
// A sign-in goes: Better Auth's authorize sends the browser to /sign-in with the request signed; the
// person ticks the terms and picks a way in; Better Auth signs them in and sends them to /choose,
// where they pick the brand this connection serves when they have more than one; /consent finishes
// the authorization and ends the sign-in's session, so the next connection starts at /sign-in again.

import { oauthProviderAuthServerMetadata } from '@better-auth/oauth-provider';
import { createAuth, sha256, type Adapter, type AuthOptions } from './auth.ts';
import { choosePage, codePage, problemPage, signInPage, type ClientFacts } from './pages.ts';
import { NO_EMAIL, WAYS, type InstagramAccount, type Way } from './providers.ts';
import { SCHEMA } from './schema.ts';

export { CODE_ATTEMPTS, CODE_LIFETIME, SENDS_PER_ADDRESS, SENDS_PER_NETWORK, sha256, type CodeMail } from './auth.ts';
export { NO_EMAIL, standIn, type InstagramAccount, type ProviderClient, type ProviderSettings } from './providers.ts';
export { publishedTerms, termsVersion, TERMS_REFRESH } from './terms.ts';
export { SCHEMA } from './schema.ts';

/** What the content server's token check returns. */
export interface Grant {
  person: string;
  /** The slug of the customer this connection serves, or null for a person who had none at sign-in. */
  customer: string | null;
  /** The version of the beta terms the person last accepted at sign-in, when terms are asked for (ADR-0047). */
  terms?: string;
}

export interface ValidatedToken {
  props: Grant;
  audience: string;
  userId: string;
}

/** Terms every person accepts at sign-in, as a closed beta's (ADR-0047). */
export interface SignInTerms {
  url: string;
  version: string;
}

/** A customer a person is a user of: its slug, and the name the person gave it, if any. */
export interface Brand {
  slug: string;
  name: string | null;
}

export interface IssuerOptions extends AuthOptions {
  /** Redirects allowed beside Claude's callback and loopback, as the account page's callback (ADR-0041). */
  redirects?: readonly string[];
  /** The terms asked for at sign-in, or none, as when the server is self-hosted (ADR-0047). */
  terms?(): Promise<SignInTerms | undefined>;
  /** Where the account page is, which a person adding a way in goes back to. */
  appUrl?: string;
}

/** How long a value from the account page lets a person add a way in to their account. */
export const LINK_LIFETIME = 10 * 60_000;

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

/**
 * Whether a request comes from Instagram's or Facebook's in-app browser, where Google refuses to
 * sign anyone in, so its button is not shown there.
 */
export function inAppBrowser(request: Request): boolean {
  return /\b(Instagram|FBAN|FBAV|FB_IAB)\b/.test(request.headers.get('user-agent') ?? '');
}

const ADDRESS = /^[^\s@<>()",;:\\[\]]+@[^\s@<>()",;:\\[\]]+\.[^\s@<>()",;:\\[\]]+$/;

/** The issuer's own cookies: the way in under way, for the one callback, and the terms ticked. */
const WAY_COOKIE = '__Host-cmokit-way';
const TERMS_COOKIE = '__Host-cmokit-terms';

function cookie(name: string, value: string, seconds: number): string {
  return `${name}=${value}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=${seconds}`;
}

function readCookie(request: Request, name: string): string | undefined {
  for (const part of (request.headers.get('cookie') ?? '').split(/;\s*/)) {
    const at = part.indexOf('=');
    if (at > 0 && part.slice(0, at) === name) return part.slice(at + 1);
  }
  return undefined;
}

function redirect(location: string, headers = new Headers()): Response {
  headers.set('location', location);
  return new Response(null, { status: 302, headers });
}

/** Copies the cookies a response sets onto the headers of the one the browser gets. */
function keep(from: Response, into: Headers): Headers {
  for (const set of from.headers.getSetCookie()) into.append('set-cookie', set);
  return into;
}

/** Makes Better Auth's tables and CMOKit's, once per database: D1 in a batch, Node's SQLite one by one. */
const made = new WeakMap<object, Promise<void>>();
function ensureSchema(database: unknown): Promise<void> {
  const db = database as { batch?(s: unknown[]): Promise<unknown>; prepare(q: string): unknown; exec(q: string): unknown };
  let ready = made.get(db);
  if (!ready) {
    ready = (async () => {
      if (typeof db.batch === 'function') await db.batch(SCHEMA.map((statement) => db.prepare(statement)));
      else for (const statement of SCHEMA) db.exec(statement);
    })();
    ready.catch(() => made.delete(db));
    made.set(db, ready);
  }
  return ready;
}

interface UserRow { id: string; email: string; emailVerified: boolean; name: string; terms?: string | null }
interface SessionRow { token: string; userId: string; brand?: string | null }
interface AccountRow { id: string; providerId: string; accountId: string; userId: string; createdAt: Date | string }

/** How a way in is named to the content server, as the identities it was named by before (ADR-0018). */
const IDENTITY: Record<string, string> = { facebook: 'meta' };

export function createIssuer(options: IssuerOptions) {
  const auth = createAuth(options);
  const issuer = options.issuer.replace(/\/$/, '');
  const now = options.now ?? Date.now;
  const redirects = options.redirects ?? [];
  const terms = options.terms ?? (async () => undefined);
  const ways = WAYS.filter((w) => options.providers[w.name]);
  const ready = ensureSchema(options.database);
  const adapter = async () => {
    await ready;
    return (await auth.$context).adapter as unknown as Adapter;
  };

  /** Calls one of Better Auth's endpoints as the browser that sent `from`, with its cookies and network. */
  async function call(path: string, body: Record<string, unknown>, from: Request): Promise<Response> {
    await ready;
    const headers = new Headers({ 'content-type': 'application/json', accept: 'application/json', origin: issuer });
    for (const name of ['cookie', 'cf-connecting-ip', 'user-agent']) {
      const value = from.headers.get(name);
      if (value) headers.set(name, value);
    }
    return auth.handler(new Request(`${issuer}${path}`, { method: 'POST', headers, body: JSON.stringify(body) }));
  }

  async function session(request: Request): Promise<{ session: SessionRow; user: UserRow } | null> {
    await ready;
    return (await auth.api.getSession({ headers: request.headers })) as { session: SessionRow; user: UserRow } | null;
  }

  // ---- The records CMOKit keeps beside Better Auth's ----

  async function brands(person: string): Promise<Brand[]> {
    const rows = await (await adapter()).findMany<{ slug: string; name: string | null; addedAt: number }>({ model: 'brand', where: [{ field: 'person', value: person }] });
    return rows.sort((a, b) => a.addedAt - b.addedAt || a.slug.localeCompare(b.slug)).map((r) => ({ slug: r.slug, name: r.name ?? null }));
  }

  async function user(person: string): Promise<UserRow | null> {
    return (await adapter()).findOne<UserRow>({ model: 'user', where: [{ field: 'id', value: person }] });
  }

  async function accounts(person: string): Promise<AccountRow[]> {
    const rows = await (await adapter()).findMany<AccountRow>({ model: 'account', where: [{ field: 'userId', value: person }] });
    return rows.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }

  /** The person a value from startLink names, once, or undefined when it is unknown, used or expired. */
  async function redeemLink(value: string): Promise<string | undefined> {
    const db = await adapter();
    const where = [{ field: 'hash', value: await sha256(value) }];
    const row = await db.findOne<{ person: string; expiresAt: number }>({ model: 'wayLink', where });
    if (!row) return undefined;
    await db.delete({ model: 'wayLink', where });
    return row.expiresAt > now() ? row.person : undefined;
  }

  /** Forgets everything the issuer holds about a person, and every token issued to them (ADR-0053). */
  async function forget(person: string): Promise<void> {
    const db = await adapter();
    const metaIds = (await accounts(person)).filter((a) => a.providerId === 'instagram').map((a) => a.accountId);
    if (metaIds.length) await db.deleteMany({ model: 'instagramSignIn', where: [{ field: 'metaId', operator: 'in', value: metaIds }] });
    for (const model of ['oauthAccessToken', 'oauthRefreshToken', 'oauthConsent', 'session', 'account']) await db.deleteMany({ model, where: [{ field: 'userId', value: person }] });
    for (const model of ['brand', 'wayLink']) await db.deleteMany({ model, where: [{ field: 'person', value: person }] });
    await db.deleteMany({ model: 'user', where: [{ field: 'id', value: person }] });
  }

  // ---- The sign-in pages ----

  /** What the sign-in screen says about the client: its name, and its domain when its metadata proved it. */
  async function clientFacts(query: URLSearchParams): Promise<{ facts: ClientFacts; redirectUris: string[] } | undefined> {
    const clientId = query.get('client_id') ?? '';
    const client = await (await adapter()).findOne<{ name?: string | null; redirectUris: string[] }>({ model: 'oauthClient', where: [{ field: 'clientId', value: clientId }] });
    if (!client) return undefined;
    let redirectHost = '';
    let loopback = false;
    try {
      const target = new URL(query.get('redirect_uri') ?? '');
      redirectHost = target.host;
      loopback = target.protocol === 'http:';
    } catch {
      // The authorize step checked it; a page posted without one shows no host.
    }
    const domain = /^https:\/\//.test(clientId) ? new URL(clientId).hostname : undefined;
    return { facts: { clientName: client.name || (domain ?? 'An app'), ...(domain ? { clientDomain: domain } : {}), redirectHost, redirectIsLoopback: loopback }, redirectUris: client.redirectUris ?? [] };
  }

  /** The sign-in screen; `from` is the browser's own request, which says whether Google can work there. */
  async function signIn(from: Request, query: URLSearchParams, problem?: string, headers?: Headers): Promise<Response> {
    const client = await clientFacts(query);
    if (!client) return problemPage('This page expired.', 400, headers);
    const own = redirects.includes(query.get('redirect_uri') ?? '');
    return signInPage({
      client: client.facts, own, query: query.toString(),
      ways: ways.filter((w) => !(w.name === 'google' && inAppBrowser(from))),
      email: Boolean(options.mail), terms: await terms(), problem,
      ...(own && query.get('link') ? { link: true } : {}),
      headers,
    });
  }

  async function chooseWay(request: Request): Promise<Response> {
    const form = await request.formData();
    const query = new URLSearchParams(String(form.get('oauth_query') ?? ''));
    const way = String(form.get('way') ?? '');

    if (way === 'cancel') {
      const client = await clientFacts(query);
      const to = query.get('redirect_uri') ?? '';
      if (!client || !client.redirectUris.includes(to) || !allowedRedirect(to, redirects)) return problemPage('This page expired.');
      const back = new URL(to);
      back.searchParams.set('error', 'access_denied');
      if (query.get('state')) back.searchParams.set('state', query.get('state')!);
      return redirect(back.toString());
    }

    // While terms are asked for, no way in goes on until the box is ticked (ADR-0047).
    const asked = await terms();
    if (asked && form.get('terms') !== 'yes') return signIn(request, query, 'Tick the box to accept the beta terms, then sign in.');
    const headers = new Headers();
    if (asked) headers.append('set-cookie', cookie(TERMS_COOKIE, asked.version, 3600));
    const signed = query.toString();

    const provider = ways.find((w) => w.name === way);
    if (provider) {
      const started = await call('/sign-in/social', { provider: provider.name, oauth_query: signed, disableRedirect: true, callbackURL: '/problem?error=expired', errorCallbackURL: '/problem' }, request);
      const url = started.ok ? ((await started.json()) as { url?: string }).url : undefined;
      if (!url) return problemPage(`Signing in with ${provider.label} didn't work.`, 502);
      headers.append('set-cookie', cookie(WAY_COOKIE, provider.name, 900));
      return redirect(url, keep(started, headers));
    }

    if (way === 'email' && options.mail) {
      const address = String(form.get('address') ?? '').trim().toLowerCase();
      if (!ADDRESS.test(address) || address.length > 254 || address.endsWith(`@${NO_EMAIL}`)) return signIn(request, query, 'That email address does not look right.');
      const sent = await call('/email-otp/send-verification-otp', { email: address, type: 'sign-in' }, request);
      if (sent.status === 429) return signIn(request, query, 'Too many codes were sent. Try again in an hour, or use another way in.');
      if (!sent.ok) return problemPage("The code couldn't be sent. Try again, or use another way in.", 502);
      return codePage({ address, query: signed, headers: keep(sent, headers) });
    }

    return signIn(request, query, 'Choose a way to sign in.');
  }

  async function enterCode(request: Request): Promise<Response> {
    const form = await request.formData();
    const signed = String(form.get('oauth_query') ?? '');
    const address = String(form.get('address') ?? '');
    const code = String(form.get('code') ?? '').trim();
    const response = await call('/sign-in/email-otp', { email: address, otp: code, oauth_query: signed }, request);
    const body = (await response.json().catch(() => ({}))) as { url?: string; code?: string };
    if (response.ok && body.url) return redirect(body.url, keep(response, new Headers()));
    if (body.code === 'INVALID_OTP') return codePage({ address, query: signed, problem: "That code doesn't match. Check it and try again." });
    return signIn(request, new URLSearchParams(signed), 'That code expired or was tried too many times. Ask for a new one.');
  }

  /** Every provider sends the person back here, and the way they chose says to which of Better Auth's callbacks. */
  async function returned(request: Request): Promise<Response> {
    const way = readCookie(request, WAY_COOKIE) as Way | undefined;
    if (!way || !ways.some((w) => w.name === way)) return problemPage('This page expired.');
    await ready;
    const url = new URL(request.url);
    const response = await auth.handler(new Request(`${issuer}/callback/${way}${url.search}`, { headers: request.headers }));
    const headers = new Headers(response.headers);
    headers.append('set-cookie', cookie(WAY_COOKIE, '', 0));
    return new Response(response.body, { status: response.status, headers });
  }

  function problem(request: Request): Response {
    const error = new URL(request.url).searchParams.get('error') ?? '';
    if (error === 'access_denied') return problemPage('Signing in was cancelled.');
    if (error === 'account_not_linked') return problemPage('That sign-in uses an email address another CMOKit account has, so it could not sign you in. Sign in with that account instead.');
    if (error === 'expired' || error === 'state_mismatch' || error === 'please_restart_the_process') return problemPage('This page expired.');
    return problemPage("Signing in didn't work.", 502);
  }

  /** Ends the sign-in's session, keeping the cookies that clear it. */
  async function signOut(request: Request, headers = new Headers()): Promise<Headers> {
    return keep(await call('/sign-out', {}, request), headers);
  }

  /**
   * Clears the sign-in's cookies from the browser but leaves its session, which expires on its own:
   * the client redeems its code against that session moments later, and signing out would also end
   * the tokens issued in it.
   */
  function forgetBrowser(request: Request, headers = new Headers()): Headers {
    for (const part of (request.headers.get('cookie') ?? '').split(';')) {
      const name = part.slice(0, part.indexOf('=')).trim();
      if (name.includes('better-auth.')) headers.append('set-cookie', `${name}=; Path=/; Max-Age=0; Secure; HttpOnly; SameSite=Lax`);
    }
    return headers;
  }

  /** After signing in: keeps the terms ticked, then picks the brand, or asks for it when there are several. */
  async function chooseBrand(request: Request): Promise<Response> {
    const signedIn = await session(request);
    if (!signedIn) return problemPage('This page expired.');
    const query = new URL(request.url).searchParams;
    const asked = await terms();
    if (asked && readCookie(request, TERMS_COOKIE) === asked.version && signedIn.user.terms !== asked.version) {
      await (await adapter()).update({ model: 'user', where: [{ field: 'id', value: signedIn.user.id }], update: { terms: asked.version } });
    }
    const link = query.get('link');
    if (link && redirects.includes(query.get('redirect_uri') ?? '')) return addWay(request, signedIn.user, link);
    const choices = await brands(signedIn.user.id);
    if (choices.length > 1) return choosePage({ brands: choices, query: query.toString() });
    return proceed(request, signedIn.session, choices[0]?.slug ?? '', query.toString());
  }

  async function choseBrand(request: Request): Promise<Response> {
    const signedIn = await session(request);
    if (!signedIn) return problemPage('This page expired.');
    const form = await request.formData();
    const customer = String(form.get('customer') ?? '');
    if (!(await brands(signedIn.user.id)).some((b) => b.slug === customer)) return problemPage('That customer is not one of yours.');
    return proceed(request, signedIn.session, customer, String(form.get('oauth_query') ?? ''));
  }

  /** Keeps the brand chosen, an empty one for none, with the session, and goes on to consent. */
  async function proceed(request: Request, signedIn: SessionRow, brand: string, signed: string): Promise<Response> {
    await (await auth.$context).internalAdapter.updateSession(signedIn.token, { brand });
    const response = await call('/oauth2/continue', { postLogin: true, oauth_query: signed }, request);
    const body = (await response.json().catch(() => ({}))) as { url?: string };
    if (!body.url) return problemPage('This page expired.');
    return redirect(body.url, keep(response, new Headers()));
  }

  /**
   * The person agreed by picking a way in on a screen that named the client, so consent is given
   * here, once the terms are accepted; the browser then forgets the sign-in.
   */
  async function consent(request: Request): Promise<Response> {
    const signedIn = await session(request);
    if (!signedIn) return problemPage('This page expired.');
    const asked = await terms();
    if (asked && signedIn.user.terms !== asked.version) return problemPage('Tick the box to accept the beta terms, then sign in.', 400, await signOut(request));
    const response = await call('/oauth2/consent', { accept: true, oauth_query: new URL(request.url).search.slice(1) }, request);
    const body = (await response.json().catch(() => ({}))) as { url?: string };
    if (!body.url) return problemPage('This page expired.', 400, await signOut(request));
    return redirect(body.url, forgetBrowser(request, keep(response, new Headers())));
  }

  /**
   * Adds the way in just used to the account of the person the value names (ADR-0018): an account
   * the way in reached that has no brands gives it up, with every way in it had, and is deleted; one
   * that has brands keeps it. The person goes back to their account page.
   */
  async function addWay(request: Request, signedIn: UserRow, link: string): Promise<Response> {
    const headers = await signOut(request);
    const owner = await redeemLink(link);
    if (!owner || !(await user(owner))) return problemPage('This page expired. Go back to your account page and add the way in again.', 400, headers);
    if (signedIn.id !== owner) {
      if ((await brands(signedIn.id)).length > 0) return problemPage('That sign-in already reaches another CMOKit account that has brands, so it was not added to yours.', 409, headers);
      const db = await adapter();
      const kept = (await user(owner))!;
      // An account keeps one email address, so a second one, with nothing else to sign in with, is not added.
      if (signedIn.emailVerified && kept.emailVerified && (await accounts(signedIn.id)).length === 0) {
        return problemPage('Your CMOKit account already signs in with an email address, so a second one was not added. Add another way in instead.', 409, headers);
      }
      await db.updateMany({ model: 'account', where: [{ field: 'userId', value: signedIn.id }], update: { userId: owner } });
      await forget(signedIn.id);
      // An account keeps one email address: the one proved first.
      if (signedIn.emailVerified && !kept.emailVerified) await db.update({ model: 'user', where: [{ field: 'id', value: owner }], update: { email: signedIn.email, emailVerified: true } });
    }
    return redirect(options.appUrl ? new URL('/', options.appUrl).toString() : `${issuer}/sign-in`, headers);
  }

  // ---- Routes ----

  const metadata = oauthProviderAuthServerMetadata(auth as never, { headers: { 'access-control-allow-origin': '*' } });

  const routes: Record<string, (request: Request) => Promise<Response> | Response> = {
    'GET /sign-in': (request) => signIn(request, new URL(request.url).searchParams),
    'POST /sign-in': chooseWay,
    'POST /code': enterCode,
    'GET /callback': returned,
    'GET /problem': problem,
    'GET /choose': chooseBrand,
    'POST /choose': choseBrand,
    'GET /consent': consent,
    'GET /oauth2/authorize': async (request) => {
      const url = new URL(request.url);
      if (!allowedRedirect(url.searchParams.get('redirect_uri') ?? '', redirects)) return problemPage('This app sends sign-ins somewhere CMOKit does not allow, so it cannot connect.');
      // Every connection may refresh its token, as a client that asks for no scope expects.
      if (!url.searchParams.get('scope')) url.searchParams.set('scope', 'offline_access');
      await ready;
      return auth.handler(new Request(url, request));
    },
    'POST /oauth2/register': async (request) => {
      const body = (await request.clone().json().catch(() => ({}))) as { redirect_uris?: unknown; application_type?: unknown };
      const uris = body.redirect_uris;
      if (!Array.isArray(uris) || uris.length === 0 || !uris.every((uri) => typeof uri === 'string' && allowedRedirect(uri, redirects))) {
        return Response.json({ error: 'invalid_redirect_uri', error_description: "Redirects are allowed only to Claude's callback or a loopback address" }, { status: 400 });
      }
      await ready;
      // A client that comes back to a loopback address is an app on the person's own computer, such as
      // a coding agent, which is a native client (RFC 8252); Better Auth otherwise takes it for a web one.
      if (body.application_type === undefined && uris.every((uri) => uri.startsWith('http:'))) {
        const headers = new Headers(request.headers);
        headers.delete('content-length');
        return auth.handler(new Request(request.url, { method: 'POST', headers, body: JSON.stringify({ ...body, application_type: 'native' }) }));
      }
      return auth.handler(request);
    },
    'POST /oauth2/token': async (request) => (await ready, auth.handler(request)),
    'POST /oauth2/revoke': async (request) => (await ready, auth.handler(request)),
    'GET /.well-known/oauth-authorization-server': async (request) => (await ready, metadata(request)),
  };

  return {
    auth,

    /** Answers the sign-in's pages and the OAuth endpoints clients use, and nothing else of Better Auth's. */
    async fetch(request: Request): Promise<Response> {
      const route = routes[`${request.method} ${new URL(request.url).pathname}`];
      if (!route) return new Response('Not found', { status: 404 });
      // A form of the sign-in's is posted only from its own pages.
      const origin = request.headers.get('origin');
      if (request.method === 'POST' && !new URL(request.url).pathname.startsWith('/oauth2/') && origin && origin !== new URL(issuer).origin) {
        return problemPage('This page was sent from somewhere else.', 403);
      }
      return route(request);
    },

    /** What the content server calls over its service binding to check a token for its audience. */
    async validateToken(resource: string, token: string): Promise<ValidatedToken | null> {
      const row = await (await adapter()).findOne<{ userId: string | null; referenceId: string | null; resources: string[] | null; expiresAt: Date | string; revoked: unknown }>({
        model: 'oauthAccessToken', where: [{ field: 'token', value: await sha256(token) }],
      });
      if (!row || !row.userId || row.revoked || new Date(row.expiresAt).getTime() <= now() || !(row.resources ?? []).includes(resource)) return null;
      const person = await user(row.userId);
      if (!person) return null;
      return { userId: person.id, audience: resource, props: { person: person.id, customer: row.referenceId || null, ...(person.terms ? { terms: person.terms } : {}) } };
    },

    /** The customers a person is a user of, for a token that names none. */
    customers: async (person: string): Promise<string[]> => (await brands(person)).map((b) => b.slug),

    /** The customers a person is a user of, each with the name the person gave it, for the account page. */
    brands,

    /** What the content server calls when it makes a customer for a person (ADR-0017), with the brand's name if it has one. */
    async addCustomer(person: string, customer: string, name?: string): Promise<void> {
      const db = await adapter();
      if (await db.findOne({ model: 'brand', where: [{ field: 'person', value: person }, { field: 'slug', value: customer }] })) return;
      await db.create({ model: 'brand', data: { person, slug: customer, name: name ?? null, addedAt: now() } });
    },

    /** Names, or renames, one of a person's customers, as they see it; false when it is not theirs. */
    async nameCustomer(person: string, customer: string, name: string): Promise<boolean> {
      const db = await adapter();
      return (await db.updateMany({ model: 'brand', where: [{ field: 'person', value: person }, { field: 'slug', value: customer }], update: { name } })) > 0;
    },

    /** The email address a person proved when signing in, for activation without a checkout (CUS-03). */
    async email(person: string): Promise<string | null> {
      const found = await user(person);
      return found?.emailVerified ? found.email : null;
    },

    /** The Instagram account a person last signed in with, for activation by a proven handle (ADR-0048). */
    async instagram(person: string): Promise<InstagramAccount | null> {
      const metaIds = (await accounts(person)).filter((a) => a.providerId === 'instagram').map((a) => a.accountId);
      if (metaIds.length === 0) return null;
      const rows = await (await adapter()).findMany<{ instagramId: string; handle: string; at: number }>({ model: 'instagramSignIn', where: [{ field: 'metaId', operator: 'in', value: metaIds }] });
      const last = rows.sort((a, b) => b.at - a.at)[0];
      return last ? { id: last.instagramId, handle: last.handle } : null;
    },

    /** The ways in a person signs in to their account with, by the identity each names, for the account page. */
    async waysIn(person: string): Promise<string[]> {
      const found = await user(person);
      if (!found) return [];
      return [
        ...(found.emailVerified ? [`email:${found.email}`] : []),
        ...(await accounts(person)).map((a) => `${IDENTITY[a.providerId] ?? a.providerId}:${a.accountId}`),
      ];
    },

    /**
     * A one-time value the account page sends a signed-in person to the sign-in with, so the way in
     * they choose is added to their own account (ADR-0018). It names when it expires, and the issuer
     * keeps only its hash, with the person.
     */
    async startLink(person: string): Promise<string> {
      const bytes = crypto.getRandomValues(new Uint8Array(24));
      const value = `${now() + LINK_LIFETIME}.${btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}`;
      await (await adapter()).create({ model: 'wayLink', data: { hash: await sha256(value), person, expiresAt: now() + LINK_LIFETIME } });
      return value;
    },

    /** Forgets a person's sign-in records and every token issued to them (ADR-0053). Safe to repeat. */
    deletePerson: forget,

    /** Better Auth's database adapter, for the one-time copy of people from the old records. */
    adapter,
  };
}

export type Issuer = ReturnType<typeof createIssuer>;
