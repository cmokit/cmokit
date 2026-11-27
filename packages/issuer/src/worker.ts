// The Cloudflare Worker adapter. An issuer's Worker is:
//
//   const { Issuer, Identity, Person } = createIssuerWorker();
//   export { Identity, Person };
//   export default Issuer;
//
// with a D1 database bound as DB, where Better Auth keeps people, their ways in, sign-in sessions and
// the OAuth server's clients and hashed tokens (ADR-0035). `Identity` (IDENTITIES), `Person` (PEOPLE)
// and the old OAuth library's namespace OAUTH_KV hold the records people were kept in before Better
// Auth; the issuer only reads them, to copy people across once, and erases them when a person deletes
// their account. `Issuer` serves the sign-in pages and the OAuth endpoints, and gives the content
// server's Worker `validateToken`, `customers`, `brands`, `addCustomer` and `nameCustomer` over a
// service binding (ADR-0029, ADR-0017), `email` and `instagram` for activation without a checkout
// (CUS-03, ADR-0048), `waysIn` and `startLink` for the ways in a person has and adds on the account
// page (ADR-0018), and `deletePerson` when a person deletes their account (ADR-0053). Every variable
// and secret it reads is in the deployment reference. The only host-specific code in the issuer lives
// here.

import { WorkerEntrypoint } from 'cloudflare:workers';
import { Identity as IdentityLogic, Person as PersonLogic } from './accounts.ts';
import { copyPeople, type OldPerson } from './copy.ts';
import { createIssuer, type Brand, type InstagramAccount, type Issuer as IssuerLogic, type ValidatedToken } from './index.ts';
import { fontResponse, type Fonts } from './look.ts';
import type { ProviderSettings } from './providers.ts';
import { sendgridCodes } from './sendgrid.ts';
import { publishedTerms } from './terms.ts';
import type { Sql } from './sql.ts';

export type { ValidatedToken } from './index.ts';

export interface IssuerEnv {
  /** Better Auth's database (ADR-0035). */
  DB: unknown;
  /**
   * The content server's key, from which the issuer derives the secret Better Auth signs its cookies
   * and steps with, and the token that runs the copy of people. A secret.
   */
  CREDENTIAL_KEY: string;
  /** The old OAuth library's grants, read once to find the people to copy. */
  OAUTH_KV: KvNamespace;
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
  /**
   * The content server's Meta app, and a Unified Login configuration of the sign-in's own; the app
   * must allow `<ISSUER_URL>/callback` as a redirect. With all three, creators sign in with Instagram
   * (ADR-0048).
   */
  INSTAGRAM_APP_ID?: string;
  INSTAGRAM_APP_SECRET?: string;
  INSTAGRAM_CONFIG_ID?: string;
  /** Where the content server serves the account page, as https://app.cmokit.ai (ADR-0041). A variable. */
  APP_URL?: string;
  /** Where the beta terms every person accepts at sign-in are published; their version is read from the page (ADR-0047). A variable. */
  TERMS_URL?: string;
}

export interface KvNamespace {
  list(options: { prefix?: string; cursor?: string }): Promise<{ keys: { name: string }[]; list_complete: boolean; cursor?: string }>;
  delete(key: string): Promise<void>;
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
    instagram(person: string): Promise<InstagramAccount | null>;
    waysIn(person: string): Promise<string[]>;
    startLink(person: string): Promise<string>;
    deletePerson(person: string): Promise<void>;
  };
}

const IDENTITY_CALLS = ['person', 'claim', 'allow', 'issueCode', 'checkCode', 'erase'] as const;
const PERSON_CALLS = ['addIdentity', 'identities', 'email', 'instagram', 'customers', 'brands', 'addCustomer', 'nameCustomer', 'erase'] as const;

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

interface OldPersonRecords {
  identities(): Promise<string[]>;
  email(): Promise<string | null>;
  instagram(): Promise<InstagramAccount | null>;
  brands(): Promise<Brand[]>;
  erase(): Promise<string[]>;
}

function providersFor(env: IssuerEnv): ProviderSettings {
  const ig = { id: env.INSTAGRAM_APP_ID?.trim(), secret: env.INSTAGRAM_APP_SECRET?.trim(), config: env.INSTAGRAM_CONFIG_ID?.trim() };
  return {
    ...(ig.id && ig.secret && ig.config ? { instagram: { id: ig.id, secret: ig.secret, config: ig.config } } : {}),
    ...(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET ? { google: { id: env.GOOGLE_CLIENT_ID, secret: env.GOOGLE_CLIENT_SECRET } } : {}),
    ...(env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET ? { github: { id: env.GITHUB_CLIENT_ID, secret: env.GITHUB_CLIENT_SECRET } } : {}),
    ...(env.META_APP_ID && env.META_APP_SECRET ? { facebook: { id: env.META_APP_ID, secret: env.META_APP_SECRET } } : {}),
  };
}

/** A key derived from the content server's, for one purpose, in base64url (RFC 5869). */
export async function derivedKey(credentialKey: string, purpose: string): Promise<string> {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(credentialKey), 'HKDF', false, ['deriveBits']);
  const bits = new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0), info: new TextEncoder().encode(purpose) }, base, 256));
  return btoa(String.fromCharCode(...bits)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** The account page's callback, the one redirect beside Claude's and loopback this deployment allows. */
export function appRedirects(env: IssuerEnv): string[] {
  return env.APP_URL ? [`${new URL(env.APP_URL).origin}/callback`] : [];
}

/** One issuer per deployment's settings and database, made on first use. */
const issuers = new WeakMap<object, Promise<IssuerLogic>>();
function issuerFor(env: IssuerEnv): Promise<IssuerLogic> {
  let made = issuers.get(env.DB as object);
  if (!made) {
    made = (async () => createIssuer({
      issuer: env.ISSUER_URL,
      audience: env.AUDIENCE,
      secret: await derivedKey(env.CREDENTIAL_KEY, 'cmokit better auth'),
      database: env.DB,
      providers: providersFor(env),
      ...(env.SENDGRID_API_KEY && env.MAIL_FROM ? { mail: sendgridCodes({ key: env.SENDGRID_API_KEY, from: env.MAIL_FROM }) } : {}),
      redirects: appRedirects(env),
      terms: () => publishedTerms(env.TERMS_URL),
      ...(env.APP_URL ? { appUrl: env.APP_URL } : {}),
    }))();
    made.catch(() => issuers.delete(env.DB as object));
    issuers.set(env.DB as object, made);
  }
  return made;
}

/** The people the old records know: each one the old OAuth library ever granted a token to. */
async function oldPeople(env: IssuerEnv): Promise<Set<string>> {
  const people = new Set<string>();
  let cursor: string | undefined;
  do {
    const page = await env.OAUTH_KV.list({ prefix: 'grant:', ...(cursor ? { cursor } : {}) });
    for (const { name } of page.keys) people.add(name.split(':')[1]!);
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  return people;
}

async function readOld(env: IssuerEnv, person: string): Promise<OldPerson> {
  const old = stub<OldPersonRecords>(env.PEOPLE, person, PERSON_CALLS);
  return { identities: (await old.identities()) ?? [], email: (await old.email()) ?? null, instagram: (await old.instagram()) ?? null, brands: (await old.brands()) ?? [] };
}

/**
 * Copies people from the old records, answering what it copied by person id alone. It runs once the
 * deploy that brings Better Auth is done, with a token derived from the content server's key, and
 * again safely: people already copied are left alone. A body may name more people by id.
 */
async function copy(request: Request, env: IssuerEnv): Promise<Response> {
  const expected = `Bearer ${await derivedKey(env.CREDENTIAL_KEY, 'cmokit copy')}`;
  if (request.headers.get('authorization') !== expected) return new Response('Not found', { status: 404 });
  const body = (await request.json().catch(() => ({}))) as { people?: unknown };
  const people = await oldPeople(env);
  if (Array.isArray(body.people)) for (const id of body.people) if (typeof id === 'string' && id) people.add(id);
  const report = await copyPeople(await issuerFor(env), people, (person) => readOld(env, person));
  return Response.json(report);
}

/** Forgets a person's sign-in records, old and new, and every token issued to them (ADR-0053). Safe to repeat. */
export async function deletePerson(env: IssuerEnv, person: string): Promise<void> {
  await (await issuerFor(env)).deletePerson(person);
  const identities = await stub<OldPersonRecords>(env.PEOPLE, person, PERSON_CALLS).erase();
  for (const name of identities ?? []) await stub<{ erase(): Promise<void> }>(env.IDENTITIES, name, IDENTITY_CALLS).erase();
  let cursor: string | undefined;
  do {
    const page = await env.OAUTH_KV.list({ prefix: `grant:${person}:`, ...(cursor ? { cursor } : {}) });
    for (const { name } of page.keys) await env.OAUTH_KV.delete(name);
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
}

/** `fonts` are the sign-in pages' two fonts, served at `/fonts/`; without them the pages use the system font (ADR-0046). */
export function createIssuerWorker(options: { fonts?: Fonts } = {}): { Issuer: IssuerEntrypoint; Identity: ObjectClass; Person: ObjectClass } {
  class Issuer extends WorkerEntrypoint<IssuerEnv> {
    async fetch(request: Request): Promise<Response> {
      const font = fontResponse(request, options.fonts);
      if (font) return font;
      const url = new URL(request.url);
      if (request.method === 'POST' && url.pathname === '/copy') return copy(request, this.env);
      return (await issuerFor(this.env)).fetch(request);
    }

    /** What the content server calls over its service binding to check a token for its audience. */
    async validateToken(resource: string, token: string): Promise<ValidatedToken | null> {
      return (await issuerFor(this.env)).validateToken(resource, token);
    }

    /** The customers a person is a user of, for a token that names none. */
    async customers(person: string): Promise<string[]> {
      return (await issuerFor(this.env)).customers(person);
    }

    /** The customers a person is a user of, each with the name the person gave it, for the account page. */
    async brands(person: string): Promise<Brand[]> {
      return (await issuerFor(this.env)).brands(person);
    }

    /** What the content server calls when it makes a customer for a person (ADR-0017), with the brand's name if it has one. */
    async addCustomer(person: string, customer: string, name?: string): Promise<void> {
      return (await issuerFor(this.env)).addCustomer(person, customer, name);
    }

    /** Names, or renames, one of a person's customers, as they see it; false when it is not theirs. */
    async nameCustomer(person: string, customer: string, name: string): Promise<boolean> {
      return (await issuerFor(this.env)).nameCustomer(person, customer, name);
    }

    /** The email address a person proved when signing in, for activation without a checkout (CUS-03). */
    async email(person: string): Promise<string | null> {
      return (await issuerFor(this.env)).email(person);
    }

    /** The Instagram account a person last signed in with, for activation by a proven handle (ADR-0048). */
    async instagram(person: string): Promise<InstagramAccount | null> {
      return (await issuerFor(this.env)).instagram(person);
    }

    /** The ways in a person signs in to their account with, by the identity each names, for the account page. */
    async waysIn(person: string): Promise<string[]> {
      return (await issuerFor(this.env)).waysIn(person);
    }

    /** A one-time value the account page sends a person to the sign-in with, to add a way in to their account (ADR-0018). */
    async startLink(person: string): Promise<string> {
      return (await issuerFor(this.env)).startLink(person);
    }

    /**
     * What the content server calls when a person deletes their account (ADR-0053): forgets their
     * sign-in records, old and new, and every token issued to them. Safe to repeat.
     */
    async deletePerson(person: string): Promise<void> {
      await deletePerson(this.env, person);
    }
  }

  return {
    Issuer,
    Identity: objectClass(IdentityLogic, IDENTITY_CALLS),
    Person: objectClass(PersonLogic, PERSON_CALLS),
  };
}
