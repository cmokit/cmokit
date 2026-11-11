// The Cloudflare Worker adapter. An issuer's Worker is:
//
//   const { Issuer, Identity, Person } = createIssuerWorker();
//   export { Identity, Person };
//   export default Issuer;
//
// with `Identity` bound as the Durable Object class IDENTITIES and `Person` as PEOPLE (ADR-0030), and
// the OAuth library's namespace as OAUTH_KV, which no code of CMOkit's reads or writes (ADR-0035).
// `Issuer` serves the sign-in pages and the library's endpoints, and gives the content server's
// Worker `validateToken`, `customers`, `brands`, `addCustomer` and `nameCustomer` over a service binding (ADR-0029, ADR-0017), and `email` for activation without a checkout (CUS-03). Every variable and secret it reads is in
// the deployment reference. The only host-specific code in the issuer lives here.

import { WorkerEntrypoint } from 'cloudflare:workers';
import { OAuthAuthorizationServer, authorizationErrorRedirect, type AuthRequest as LibraryRequest } from '@cloudflare/workers-oauth-provider';
import { Identity as IdentityLogic, Person as PersonLogic } from './accounts.ts';
import { allowedRedirect, createSignIn, type Accounts, type Brand, type Grant, type IdentityRecords, type PersonRecords, type SignInOAuth } from './index.ts';
import { github, google, meta, type Provider } from './providers.ts';
import { sendgridCodes } from './sendgrid.ts';
import type { Sql } from './sql.ts';

export interface IssuerEnv {
  /** The OAuth library's grants, codes and hashed tokens (ADR-0035). */
  OAUTH_KV: unknown;
  IDENTITIES: DurableObjectNamespace;
  PEOPLE: DurableObjectNamespace;
  /** The issuer's own address. A variable. */
  ISSUER_URL: string;
  /** The content server's address, the one audience the issuer issues tokens for. A variable. */
  AUDIENCE: string;
  /** A SendGrid key with Mail Send access, and the address codes come from. Email codes need both. */
  SENDGRID_API_KEY?: string;
  MAIL_FROM?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  GITHUB_CLIENT_ID?: string;
  GITHUB_CLIENT_SECRET?: string;
  META_APP_ID?: string;
  META_APP_SECRET?: string;
  /** Where the content server serves the account page, as https://app.cmokit.ai (ADR-0041). A variable. */
  APP_URL?: string;
}

export interface DurableObjectNamespace {
  idFromName(name: string): unknown;
  get(id: unknown): { fetch(input: string, init?: RequestInit): Promise<Response> };
}

export interface DurableObjectState {
  storage: { sql: { exec(query: string, ...params: unknown[]): { toArray(): Record<string, string | number | null>[] } } };
}

/** A Durable Object class, as the runtime constructs it. */
export interface ObjectClass {
  new (ctx: DurableObjectState, env: unknown): { fetch(request: Request): Promise<Response> };
}

/** The issuer's Worker entrypoint, as the runtime constructs it. */
export interface IssuerEntrypoint {
  new (ctx: unknown, env: IssuerEnv): {
    fetch(request: Request): Promise<Response>;
    validateToken(resource: string, token: string): Promise<ValidatedToken | null>;
    customers(person: string): Promise<string[]>;
    brands(person: string): Promise<Brand[]>;
    addCustomer(person: string, customer: string, name?: string): Promise<void>;
    nameCustomer(person: string, customer: string, name: string): Promise<boolean>;
    email(person: string): Promise<string | null>;
  };
}

const IDENTITY_CALLS = ['person', 'claim', 'allow', 'issueCode', 'checkCode'] as const;
const PERSON_CALLS = ['addIdentity', 'identities', 'email', 'customers', 'brands', 'addCustomer', 'nameCustomer'] as const;

/** A Durable Object class that runs one logic class's calls, each a POST of its arguments as JSON. */
function objectClass<L>(Logic: new (sql: Sql) => L, calls: readonly string[]): ObjectClass {
  return class {
    readonly #logic: L;

    constructor(ctx: DurableObjectState, _env: unknown) {
      this.#logic = new Logic({ all: (query, ...params) => ctx.storage.sql.exec(query, ...params).toArray() });
    }

    async fetch(request: Request): Promise<Response> {
      const call = new URL(request.url).pathname.slice(1);
      if (!calls.includes(call)) return new Response(null, { status: 404 });
      const args = await request.json() as unknown[];
      const result = await (this.#logic[call as keyof L] as (...a: unknown[]) => Promise<unknown>).apply(this.#logic, args);
      return Response.json({ result: result ?? null });
    }
  };
}

function stub<T>(namespace: DurableObjectNamespace, name: string, calls: readonly string[]): T {
  const object = namespace.get(namespace.idFromName(name));
  return Object.fromEntries(calls.map((call) => [call, async (...args: unknown[]) => {
    const response = await object.fetch(`https://object/${call}`, { method: 'POST', body: JSON.stringify(args) });
    if (!response.ok) throw new Error(`${call} answered ${response.status}`);
    return ((await response.json()) as { result: unknown }).result ?? undefined;
  }])) as T;
}

function providersFor(env: IssuerEnv): Provider[] {
  const providers: Provider[] = [];
  if (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) providers.push(google({ id: env.GOOGLE_CLIENT_ID, secret: env.GOOGLE_CLIENT_SECRET }));
  if (env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET) providers.push(github({ id: env.GITHUB_CLIENT_ID, secret: env.GITHUB_CLIENT_SECRET }));
  if (env.META_APP_ID && env.META_APP_SECRET) providers.push(meta({ id: env.META_APP_ID, secret: env.META_APP_SECRET }));
  return providers;
}

const servers = new Map<string, OAuthAuthorizationServer<IssuerEnv>>();

/** The OAuth library's authorization server, for this deployment's issuer and audience. */
export function authorizationServer(env: IssuerEnv): OAuthAuthorizationServer<IssuerEnv> {
  const key = `${env.ISSUER_URL} ${env.AUDIENCE}`;
  let server = servers.get(key);
  if (!server) {
    server = new OAuthAuthorizationServer<IssuerEnv>({
      issuer: env.ISSUER_URL,
      resources: [env.AUDIENCE],
      // Claude registers by its Client ID Metadata Document; a client that cannot, such as a coding
      // agent, registers dynamically. Either way every redirect it names must be allowed (ADR-0018).
      clientIdMetadataDocumentEnabled: true,
      clientRegistrationEndpoint: '/register',
      clientRegistrationCallback: ({ clientMetadata }) => {
        const uris = clientMetadata.redirect_uris;
        if (!Array.isArray(uris) || uris.length === 0 || !uris.every((uri) => typeof uri === 'string' && allowedRedirect(uri, appRedirects(env)))) {
          return { code: 'invalid_redirect_uri', description: "Redirects are allowed only to Claude's callback or a loopback address", status: 400 };
        }
      },
    });
    servers.set(key, server);
  }
  return server;
}

/** The account page's callback, the one redirect beside Claude's and loopback this deployment allows. */
export function appRedirects(env: IssuerEnv): string[] {
  return env.APP_URL ? [`${new URL(env.APP_URL).origin}/callback`] : [];
}

function signInFor(env: IssuerEnv) {
  const helpers = authorizationServer(env).getOAuthApi(env);
  const oauth: SignInOAuth<LibraryRequest> = {
    parseAuthRequest: (request) => helpers.parseAuthRequest(request),
    lookupClient: (clientId) => helpers.lookupClient(clientId),
    describeConsent: (request) => helpers.describeConsent(request),
    beginConsent: (request) => helpers.beginConsent(request),
    approveConsent: (request, handle) => helpers.approveConsent(request, handle),
    denyConsent: (request, handle) => helpers.denyConsent(request, handle),
    beginUpstream: (request, options) => helpers.beginUpstream(request, options),
    finishUpstream: (request) => helpers.finishUpstream(request),
    completeAuthorization: (options) => helpers.completeAuthorization(options),
    declined: (request) => authorizationErrorRedirect(request, 'access_denied'),
  };
  const accounts: Accounts = {
    identity: (name) => stub<IdentityRecords>(env.IDENTITIES, name, IDENTITY_CALLS),
    person: (id) => stub<PersonRecords>(env.PEOPLE, id, PERSON_CALLS),
  };
  return createSignIn({
    issuer: env.ISSUER_URL,
    oauth,
    accounts,
    mail: env.SENDGRID_API_KEY && env.MAIL_FROM ? sendgridCodes({ key: env.SENDGRID_API_KEY, from: env.MAIL_FROM }) : undefined,
    providers: providersFor(env),
    network: (request) => request.headers.get('cf-connecting-ip') ?? 'unknown',
    redirects: appRedirects(env),
  });
}

export interface ValidatedToken {
  props: Grant;
  audience: string;
  userId: string;
}

export function createIssuerWorker(): { Issuer: IssuerEntrypoint; Identity: ObjectClass; Person: ObjectClass } {
  class Issuer extends WorkerEntrypoint<IssuerEnv> {
    async fetch(request: Request): Promise<Response> {
      return (await signInFor(this.env)(request)) ?? authorizationServer(this.env).fetch(request, this.env, this.ctx);
    }

    /** What the content server calls over its service binding to check a token for its audience. */
    validateToken(resource: string, token: string): Promise<ValidatedToken | null> {
      return authorizationServer(this.env).validateToken<Grant>(resource, token, this.env);
    }

    /** The customers a person is a user of, for a token that names none. */
    customers(person: string): Promise<string[]> {
      return stub<PersonRecords>(this.env.PEOPLE, person, PERSON_CALLS).customers();
    }

    /** The customers a person is a user of, each with the name the person gave it, for the account page. */
    brands(person: string): Promise<Brand[]> {
      return stub<PersonRecords>(this.env.PEOPLE, person, PERSON_CALLS).brands();
    }

    /** What the content server calls when it makes a customer for a person (ADR-0017), with the brand's name if it has one. */
    addCustomer(person: string, customer: string, name?: string): Promise<void> {
      return stub<PersonRecords>(this.env.PEOPLE, person, PERSON_CALLS).addCustomer(customer, Date.now(), name);
    }

    /** Names, or renames, one of a person's customers, as they see it; false when it is not theirs. */
    nameCustomer(person: string, customer: string, name: string): Promise<boolean> {
      return stub<PersonRecords>(this.env.PEOPLE, person, PERSON_CALLS).nameCustomer(customer, name);
    }

    /** The email address a person proved when signing in, for activation without a checkout (CUS-03). */
    email(person: string): Promise<string | null> {
      return stub<PersonRecords>(this.env.PEOPLE, person, PERSON_CALLS).email();
    }
  }

  return {
    Issuer,
    Identity: objectClass(IdentityLogic, IDENTITY_CALLS),
    Person: objectClass(PersonLogic, PERSON_CALLS),
  };
}
