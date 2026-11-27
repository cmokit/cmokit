// CMOKit's issuer on Better Auth (ADR-0018, ADR-0035): people, their ways in, their sign-in sessions
// and the MCP OAuth server that Claude connects through, all in one SQL database (D1 when hosted,
// Node's SQLite in tests). Better Auth has no screens; the sign-in pages are CMOKit's own, in
// index.ts. Beside Better Auth's own tables, the database holds four of CMOKit's:
//
// - `brand`: the customers a person is a user of, each with the name the person gave it. The
//   customer's own object is the authority on who its users are; this is an index of it, written in
//   the same step (ADR-0030).
// - `instagramSignIn`: the Instagram account each Meta login last shared, by its ID and handle, for
//   activation by a proven handle (ADR-0048).
// - `codeSend`: when sign-in codes were sent, to an address or from a network, for their hourly limits.
// - `wayLink`: the hashed one-time values that let a person add a way in to their own account.

import { betterAuth, type BetterAuthPlugin } from 'better-auth';
import { APIError, createAuthMiddleware } from 'better-auth/api';
import { emailOTP, genericOAuth } from 'better-auth/plugins';
import { oauthProvider } from '@better-auth/oauth-provider';
import { cimd } from '@better-auth/cimd';
import { instagramProvider, socialProviders, type InstagramAccount, type ProviderSettings } from './providers.ts';

/** How long a code works and how many tries it allows. */
export const CODE_LIFETIME = 10 * 60_000;
export const CODE_ATTEMPTS = 5;
/** Codes sent to one address, and from one network, in an hour. */
export const SENDS_PER_ADDRESS = 5;
export const SENDS_PER_NETWORK = 20;
const HOUR = 60 * 60_000;

/** Sends a sign-in code. It is transactional mail, in no unsubscribe group (ADR-0018). */
export interface CodeMail {
  sendCode(to: string, code: string): Promise<void>;
}

export interface AuthOptions {
  /** The issuer's own address; providers send the person back to `<issuer>/callback`. */
  issuer: string;
  /** The content server's address, the one audience tokens are issued for. */
  audience: string;
  /** At least 32 characters, which sign Better Auth's cookies and the sign-in's steps. */
  secret: string;
  /** A D1 database, or Node's SQLite in tests, with the schema in schema.ts. */
  database: unknown;
  providers: ProviderSettings;
  /** Sends email codes, or undefined when email sign-in is not set up. */
  mail?: CodeMail;
  /** Fetches a client's metadata document (ADR-0018). */
  fetchMetadata?: typeof fetch;
  /** What the Instagram provider fetches with, for tests. */
  fetch?: typeof fetch;
  now?(): number;
}

/** The SHA-256 of a value, in base64url: how tokens and one-time values are kept. */
export async function sha256(value: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
  return btoa(String.fromCharCode(...digest)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

const person = { type: 'string', required: true, references: { model: 'user', field: 'id', onDelete: 'cascade' }, index: true } as const;

/** CMOKit's own tables, declared to Better Auth so its adapter reads and writes them. */
const cmokit = {
  id: 'cmokit',
  schema: {
    brand: { fields: { person, slug: { type: 'string', required: true }, name: { type: 'string', required: false }, addedAt: { type: 'number', required: true } } },
    instagramSignIn: { fields: { metaId: { type: 'string', required: true, unique: true }, instagramId: { type: 'string', required: true }, handle: { type: 'string', required: true }, at: { type: 'number', required: true } } },
    codeSend: { fields: { key: { type: 'string', required: true, index: true }, at: { type: 'number', required: true } } },
    wayLink: { fields: { hash: { type: 'string', required: true, unique: true }, person, expiresAt: { type: 'number', required: true } } },
  },
} satisfies BetterAuthPlugin;

/** Counts a send against a limit per hour. False, and nothing counted, when the limit is reached. */
async function allow(adapter: Adapter, key: string, limit: number, now: number): Promise<boolean> {
  await adapter.deleteMany({ model: 'codeSend', where: [{ field: 'key', value: key }, { field: 'at', operator: 'lte', value: now - HOUR }] });
  if ((await adapter.count({ model: 'codeSend', where: [{ field: 'key', value: key }] })) >= limit) return false;
  await adapter.create({ model: 'codeSend', data: { key, at: now } });
  return true;
}

/** No provider's token is kept: the sign-in reads who the person is and nothing more. */
const NO_TOKENS = { accessToken: null, refreshToken: null, idToken: null, accessTokenExpiresAt: null, refreshTokenExpiresAt: null, scope: null };

export function createAuth(options: AuthOptions) {
  const now = options.now ?? Date.now;
  const issuer = options.issuer.replace(/\/$/, '');
  const callback = `${issuer}/callback`;
  const { instagram } = options.providers;
  let adapter: Promise<Adapter> | undefined;
  const records = () => (adapter ??= auth.$context.then((c) => c.adapter as unknown as Adapter));

  /** Keeps the Instagram account a Meta login shared, replacing what it shared before (ADR-0048). */
  const shared = async (metaId: string, account: InstagramAccount) => {
    const db = await records();
    await db.deleteMany({ model: 'instagramSignIn', where: [{ field: 'metaId', value: metaId }] });
    await db.create({ model: 'instagramSignIn', data: { metaId, instagramId: account.id, handle: account.handle, at: now() } });
  };

  const auth = betterAuth({
    baseURL: issuer,
    basePath: '/',
    secret: options.secret,
    database: options.database as never,
    trustedOrigins: [issuer],
    // Sign-in sessions last only as long as a sign-in; the tokens a client gets outlive them.
    session: { expiresIn: 60 * 60, additionalFields: { brand: { type: 'string', required: false, input: false } } },
    // The version of the beta terms the person last accepted at sign-in (ADR-0047).
    user: { additionalFields: { terms: { type: 'string', required: false, input: false } } },
    account: { accountLinking: { enabled: true } },
    socialProviders: socialProviders(options.providers, callback),
    rateLimit: { enabled: false },
    advanced: { database: { generateId: () => crypto.randomUUID() }, ipAddress: { ipAddressHeaders: ['cf-connecting-ip'] } },
    databaseHooks: {
      account: {
        create: { before: async (account) => ({ data: { ...account, ...NO_TOKENS } }) },
        update: { before: async (account) => ({ data: { ...account, ...NO_TOKENS } }) },
      },
    },
    hooks: {
      // Codes go only to sign in, and only so many an hour (ADR-0018).
      before: createAuthMiddleware(async (ctx) => {
        if (ctx.path !== '/email-otp/send-verification-otp') return;
        if (ctx.body?.type !== 'sign-in') throw new APIError('BAD_REQUEST', { message: 'Codes are sent only to sign in' });
        const db = ctx.context.adapter as unknown as Adapter;
        const network = ctx.request?.headers.get('cf-connecting-ip') ?? 'unknown';
        const address = String(ctx.body?.email ?? '').trim().toLowerCase();
        const at = now();
        if (!(await allow(db, `network:${network}`, SENDS_PER_NETWORK, at)) || !(await allow(db, `email:${address}`, SENDS_PER_ADDRESS, at))) {
          throw new APIError('TOO_MANY_REQUESTS', { message: 'Too many codes were sent' });
        }
      }),
    },
    plugins: [
      cmokit,
      ...(options.mail ? [emailOTP({
        otpLength: 6,
        expiresIn: CODE_LIFETIME / 1000,
        allowedAttempts: CODE_ATTEMPTS,
        sendVerificationOTP: async ({ email, otp }) => options.mail!.sendCode(email, otp),
      })] : []),
      ...(instagram ? [genericOAuth({ config: [instagramProvider(instagram, callback, shared, options.fetch)] })] : []),
      oauthProvider({
        loginPage: '/sign-in',
        consentPage: '/consent',
        scopes: ['offline_access'],
        resources: [options.audience],
        clientRegistrationDefaultResources: [options.audience],
        // Claude registers by its Client ID Metadata Document; a client that cannot, such as a coding
        // agent, registers dynamically. Either way every redirect it names must be allowed (index.ts).
        allowDynamicClientRegistration: true,
        allowUnauthenticatedClientRegistration: true,
        disableJwtPlugin: true,
        storeTokens: { hash: (token) => sha256(token) },
        // The brand a connection serves is chosen after signing in, and the tokens name it (ADR-0029).
        postLogin: {
          page: '/choose',
          consentReferenceId: async ({ session }) => (session as { brand?: string | null }).brand || undefined,
          shouldRedirect: async ({ session }) => (session as { brand?: string | null }).brand == null,
        },
      }),
      cimd({ fetchClientMetadataResource: (url, init) => (options.fetchMetadata ?? fetch)(url, init) }),
    ],
  });
  return auth;
}

export type Auth = ReturnType<typeof createAuth>;

/** The part of Better Auth's database adapter the issuer uses. */
export interface Adapter {
  create<T = Record<string, unknown>>(options: { model: string; data: Record<string, unknown>; forceAllowId?: boolean }): Promise<T>;
  findOne<T = Record<string, unknown>>(options: { model: string; where: Where[] }): Promise<T | null>;
  findMany<T = Record<string, unknown>>(options: { model: string; where?: Where[]; sortBy?: { field: string; direction: 'asc' | 'desc' } }): Promise<T[]>;
  count(options: { model: string; where?: Where[] }): Promise<number>;
  update<T = Record<string, unknown>>(options: { model: string; where: Where[]; update: Record<string, unknown> }): Promise<T | null>;
  updateMany(options: { model: string; where: Where[]; update: Record<string, unknown> }): Promise<number>;
  delete(options: { model: string; where: Where[] }): Promise<void>;
  deleteMany(options: { model: string; where: Where[] }): Promise<number>;
}

export interface Where {
  field: string;
  value: string | number | boolean | null | string[];
  operator?: 'eq' | 'ne' | 'lt' | 'lte' | 'gt' | 'gte' | 'in';
}
