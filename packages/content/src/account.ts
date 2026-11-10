// The account page (HST-17, ADR-0041): where a person who signed in sees their CMOkit account in a
// browser, at an origin of its own such as https://app.cmokit.ai. It signs the person in through the
// same issuer as Claude does, as an OAuth client that registers by its Client ID Metadata Document,
// with PKCE and no secret, and keeps the token it gets in a cookie the page's scripts cannot read. It
// shows the account, the beta terms, the connections and the current brand context, and downloads
// everything held for the customer (HST-13). Changes are made in Claude. It uses the web-standard
// Request and Response only (ADR-0003).

import { accountPage, signedOutPage, type AccountView } from './pages.ts';
import type { Billing, CustomerPages, Terms, Tokens } from './index.ts';
import type { CustomerCalls } from './tools.ts';

export interface AccountOptions {
  /** The account page's own origin, such as https://app.cmokit.ai. */
  origin: string;
  /** Trades a code at the issuer's token endpoint for an access token, or undefined when refused. */
  exchange(form: URLSearchParams): Promise<{ access_token: string; expires_in?: number } | undefined>;
  /** The email address a person proved when signing in, if any. */
  email(person: string): Promise<string | null>;
}

/** What the account page needs from the content server around it. */
export interface AccountContext {
  issuer: string;
  audience: string;
  tokens: Tokens;
  /** The customer a person's sign-in serves, as at the hosted MCP address, or undefined for none. */
  served(checked: { person: string; customer?: string }): Promise<string | undefined>;
  customer(slug: string): CustomerCalls & CustomerPages & { exportAll(): Promise<{ json: string; markdown: string }> };
  billing?: Billing;
  terms?: Terms;
}

const SESSION = '__Host-cmokit-session';
const SIGNIN = '__Host-cmokit-signin';
const SIGNIN_SECONDS = 600;
const PATHS = new Set(['/', '/client.json', '/signin', '/callback', '/signout', '/export']);

/** Whether a path is the account page's; every other path falls through to the content server. */
export function isAccountPath(pathname: string): boolean {
  return PATHS.has(pathname);
}

export async function handleAccount(request: Request, url: URL, account: AccountOptions, context: AccountContext): Promise<Response> {
  const clientId = `${account.origin}/client.json`;
  const redirectUri = `${account.origin}/callback`;
  const route = `${request.method} ${url.pathname}`;

  if (route === 'GET /client.json') {
    return Response.json({
      client_id: clientId,
      client_name: 'CMOkit account',
      client_uri: account.origin,
      redirect_uris: [redirectUri],
      grant_types: ['authorization_code'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
    });
  }

  if (route === 'GET /signin') {
    const state = random(16);
    const verifier = random(32);
    const authorize = new URL(`${context.issuer.replace(/\/$/, '')}/authorize`);
    for (const [name, value] of Object.entries({
      response_type: 'code', client_id: clientId, redirect_uri: redirectUri, state,
      code_challenge: await challenge(verifier), code_challenge_method: 'S256', resource: context.audience,
    })) authorize.searchParams.set(name, value);
    return redirect(authorize.toString(), cookie(SIGNIN, `${state}.${verifier}`, SIGNIN_SECONDS));
  }

  if (route === 'GET /callback') {
    const [state, verifier] = (readCookie(request, SIGNIN) ?? '').split('.');
    const code = url.searchParams.get('code');
    if (!state || !verifier || !code || url.searchParams.get('state') !== state) return redirect('/signin', cookie(SIGNIN, '', 0));
    const token = await account.exchange(new URLSearchParams({
      grant_type: 'authorization_code', code, redirect_uri: redirectUri, client_id: clientId, code_verifier: verifier, resource: context.audience,
    }));
    if (!token) return redirect('/signin', cookie(SIGNIN, '', 0));
    const headers = new Headers({ location: '/' });
    headers.append('set-cookie', cookie(SIGNIN, '', 0));
    headers.append('set-cookie', cookie(SESSION, token.access_token, token.expires_in ?? 3600));
    return new Response(null, { status: 302, headers });
  }

  if (route === 'POST /signout') {
    const response = signedOutPage();
    response.headers.append('set-cookie', cookie(SESSION, '', 0));
    return response;
  }

  if (route !== 'GET /' && route !== 'GET /export') return new Response('Not found', { status: 404 });

  const session = readCookie(request, SESSION);
  const checked = session ? await context.tokens.check(session) : undefined;
  if (!checked || checked.audience !== context.audience) return redirect('/signin', cookie(SESSION, '', 0));
  const slug = await context.served(checked);
  const customer = slug === undefined ? undefined : context.customer(slug);
  if (customer && !(await customer.isUser(checked.person))) return new Response('This account is not a user of this customer.', { status: 403 });

  if (route === 'GET /export') {
    if (!customer) return new Response('This account holds nothing yet.', { status: 404 });
    const { json } = await customer.exportAll();
    return new Response(json, {
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'content-disposition': 'attachment; filename="cmokit-export.json"',
        'cache-control': 'no-store',
      },
    });
  }

  const view: AccountView = { email: await account.email(checked.person) };
  if (customer && slug !== undefined) {
    const base = `${account.origin}/customers/${slug}`;
    const status = await customer.status(checked.person, base);
    view.customer = {
      access: status.access,
      connections: status.connections.map((c) => ({ vendor: c.vendor, name: c.calendar })),
      missing: (status.missing as { label: string; link: string; optional?: boolean }[]).map((m) => ({ label: m.label, link: m.link, optional: m.optional === true })),
      brand: await customer.brandRead(),
    };
    const { terms, billing } = context;
    if (terms) {
      const accepted = await customer.termsAccepted(checked.person, terms.version);
      view.customer.terms = accepted
        ? { accepted: true, version: terms.version, url: terms.url }
        : { accepted: false, version: terms.version, url: terms.url, link: `${base}/terms?t=${(await customer.termsLink(checked.person)).token}` };
    }
    const held = billing ? await customer.billing() : undefined;
    if (billing && held) view.customer.manage = await billing.portal(held, `${account.origin}/`).catch(() => undefined);
  }
  return accountPage(view);
}

function random(bytes: number): string {
  return base64url(crypto.getRandomValues(new Uint8Array(bytes)));
}

async function challenge(verifier: string): Promise<string> {
  return base64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));
}

function base64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function cookie(name: string, value: string, seconds: number): string {
  return `${name}=${value}; Max-Age=${seconds}; Path=/; Secure; HttpOnly; SameSite=Lax`;
}

function readCookie(request: Request, name: string): string | undefined {
  for (const part of (request.headers.get('cookie') ?? '').split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return rest.join('=') || undefined;
  }
  return undefined;
}

function redirect(location: string, setCookie: string): Response {
  return new Response(null, { status: 302, headers: { location, 'set-cookie': setCookie } });
}
