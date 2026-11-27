// The issuer's Worker on Node, with Better Auth itself on Node's SQLite in place of D1, stand-ins for
// the old records' KV namespace and Durable Object namespaces, and stand-ins for each provider and
// for SendGrid. Every sign-in goes from Claude's authorization request to a token the content
// server's check accepts, as ADR-0018's confirmation lists.

import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { SCHEMA } from '../src/schema.ts';
import { schemaFor } from './helpers.ts';

// The Worker imports the Workers runtime's entrypoint class; on Node it is a stand-in.
registerHooks({
  resolve(specifier, context, next) {
    if (specifier === 'cloudflare:workers') {
      return { url: 'data:text/javascript,export class WorkerEntrypoint { constructor(ctx, env) { this.ctx = ctx; this.env = env; } }', shortCircuit: true };
    }
    return next(specifier, context);
  },
});

const { createIssuerWorker, derivedKey } = await import('../src/worker.ts');
type Env = import('../src/worker.ts').IssuerEnv;

const ISSUER = 'https://auth.example';
const AUDIENCE = 'https://content.example/mcp';
const CLAUDE = 'https://claude.ai/api/mcp/auth_callback';
const KEY = 'test-credential-key-of-the-content-server';

function kv() {
  const store = new Map<string, string>();
  return {
    store,
    async list(options: { prefix?: string } = {}) {
      return { keys: [...store.keys()].filter((k) => k.startsWith(options.prefix ?? '')).map((name) => ({ name })), list_complete: true };
    },
    async delete(key: string) {
      store.delete(key);
    },
  };
}

function namespace(Class: new (ctx: any, env: unknown) => { fetch(r: Request): Promise<Response> }) {
  const objects = new Map<string, { fetch(r: Request): Promise<Response> }>();
  return {
    idFromName: (name: string) => name,
    get: (id: unknown) => ({
      fetch: (input: string, init?: RequestInit) => {
        let object = objects.get(id as string);
        if (!object) {
          const db = new DatabaseSync(':memory:');
          object = new Class({ storage: { sql: { exec: (q: string, ...p: unknown[]) => ({ toArray: () => db.prepare(q).all(...(p as never[])) }) } } }, {});
          objects.set(id as string, object);
        }
        return object.fetch(new Request(input, init));
      },
    }),
  };
}

const call = async (ns: ReturnType<typeof namespace>, name: string, method: string, ...args: unknown[]) =>
  ((await (await ns.get(name).fetch(`https://object/${method}`, { method: 'POST', body: JSON.stringify(args) })).json()) as { result: unknown }).result;

/** A browser: keeps the issuer's cookies, posts forms from the issuer's pages, and follows redirects within the issuer. */
function browser(worker: { fetch(r: Request): Promise<Response> }, agent?: string) {
  const jar = new Map<string, string>();
  return async (path: string, init: { form?: Record<string, string>; origin?: string } = {}) => {
    let url = new URL(path, ISSUER).toString();
    let form = init.form;
    for (;;) {
      const headers = new Headers({ 'cf-connecting-ip': '203.0.113.7', accept: 'text/html' });
      if (agent) headers.set('user-agent', agent);
      if (jar.size) headers.set('cookie', [...jar].map(([k, v]) => `${k}=${v}`).join('; '));
      if (form) {
        headers.set('content-type', 'application/x-www-form-urlencoded');
        headers.set('origin', init.origin ?? ISSUER);
      }
      const response = await worker.fetch(new Request(url, { method: form ? 'POST' : 'GET', headers, body: form ? new URLSearchParams(form) : undefined }));
      for (const cookie of response.headers.getSetCookie()) {
        const [pair] = cookie.split(';');
        const [name, value] = [pair.slice(0, pair.indexOf('=')), pair.slice(pair.indexOf('=') + 1)];
        if (/max-age=0/i.test(cookie) || value === '') jar.delete(name);
        else jar.set(name, value);
      }
      const location = response.headers.get('location');
      if (response.status !== 302 || !location || !new URL(location, ISSUER).toString().startsWith(`${ISSUER}/`)) return response;
      url = new URL(location, ISSUER).toString();
      form = undefined;
    }
  };
}

const unescape = (value: string) => value.replace(/&#(\d+);/g, (_, c) => String.fromCharCode(Number(c)));
const hidden = (html: string, name: string) => unescape(html.match(new RegExp(`name="${name}" value="([^"]*)"`))?.[1] ?? '');

async function s256(verifier: string) {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
  return btoa(String.fromCharCode(...digest)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function setup(extra: Partial<Env> = {}) {
  const { Issuer, Identity, Person } = createIssuerWorker();
  const people = namespace(Person);
  const identities = namespace(Identity);
  const db = new DatabaseSync(':memory:');
  const grants = kv();
  const env = {
    DB: db, CREDENTIAL_KEY: KEY, OAUTH_KV: grants, IDENTITIES: identities, PEOPLE: people, ISSUER_URL: ISSUER, AUDIENCE,
    SENDGRID_API_KEY: 'sg-key', MAIL_FROM: 'signin@cmokit.example', ...extra,
  } as unknown as Env;
  const worker = new Issuer({ waitUntil() {}, passThroughOnException() {} }, env) as unknown as InstanceType<typeof Issuer> & { fetch(r: Request): Promise<Response> };
  const personBy = (email: string) => (db.prepare('SELECT id FROM "user" WHERE email = ?').get(email) as { id: string } | undefined)?.id ?? null;
  return { worker, env, db, people, identities, grants, personBy };
}

/** Records SendGrid's mail and stands in for the providers and Claude's metadata, behind the global fetch. */
function outside(answers: Record<string, unknown> = {}) {
  const mail: any[] = [];
  const calls: { url: string; init?: RequestInit }[] = [];
  const real = globalThis.fetch;
  globalThis.fetch = async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    calls.push({ url, init: input instanceof Request ? { method: input.method, body: await input.clone().text() } : init });
    if (url === 'https://api.sendgrid.com/v3/mail/send') {
      mail.push(JSON.parse(String(init?.body)));
      return new Response(null, { status: 202 });
    }
    const answer = Object.entries(answers).find(([prefix]) => url.startsWith(prefix));
    if (answer) return typeof answer[1] === 'string' ? new Response(answer[1], { headers: { 'content-type': 'text/html' } }) : Response.json(answer[1]);
    throw new Error(`unexpected fetch ${url}`);
  };
  return { mail, calls, restore: () => { globalThis.fetch = real; } };
}

async function register(worker: { fetch(r: Request): Promise<Response> }, redirects: string[], name = 'Claude Code') {
  const response = await worker.fetch(new Request(`${ISSUER}/oauth2/register`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ client_name: name, redirect_uris: redirects, token_endpoint_auth_method: 'none', grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'] }),
  }));
  return { status: response.status, body: await response.json() as { client_id?: string } };
}

async function authorizeUrl(clientId: string, redirect: string, verifier: string, extra: Record<string, string> = {}) {
  return `/oauth2/authorize?${new URLSearchParams({
    response_type: 'code', client_id: clientId, redirect_uri: redirect, state: 'claude-state',
    code_challenge: await s256(verifier), code_challenge_method: 'S256', resource: AUDIENCE, ...extra,
  })}`;
}

type Go = ReturnType<typeof browser>;

/** Opens the sign-in screen for a new client of Claude's, as Claude's first request does. */
async function open(worker: any, go: Go = browser(worker), redirect = CLAUDE, extra: Record<string, string> = {}) {
  const verifier = 'v'.repeat(64);
  const { body: client } = await register(worker, [redirect]);
  const page = await go(await authorizeUrl(client.client_id!, redirect, verifier, extra));
  return { page, html: await page.clone().text(), go, verifier, clientId: client.client_id! };
}

/** Signs in by email code from Claude's first request to the response that follows the right code. */
async function emailSignIn(worker: any, address: string, mail: any[], extra: Record<string, string> = {}) {
  const opened = await open(worker);
  assert.equal(opened.page.status, 200);
  const codePage = await opened.go('/sign-in', { form: { oauth_query: hidden(opened.html, 'oauth_query'), way: 'email', address, ...extra } });
  const html = await codePage.text();
  const sent = mail.at(-1);
  const code = sent.subject.slice(0, 6);
  const done = await opened.go('/code', { form: { oauth_query: hidden(html, 'oauth_query'), address: hidden(html, 'address'), code } });
  return { ...opened, done, codePage: html, sent };
}

async function tokensFor(worker: any, location: string, clientId: string, verifier: string, redirect = CLAUDE) {
  const url = new URL(location);
  assert.equal(url.origin + url.pathname, redirect);
  assert.equal(url.searchParams.get('state'), 'claude-state');
  assert.equal(url.searchParams.get('iss'), ISSUER);
  const response = await worker.fetch(new Request(`${ISSUER}/oauth2/token`, {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'authorization_code', code: url.searchParams.get('code')!, redirect_uri: redirect, client_id: clientId, code_verifier: verifier, resource: AUDIENCE }),
  }));
  assert.equal(response.status, 200, await response.clone().text());
  return await response.json() as { access_token: string; refresh_token?: string; expires_in: number };
}

const tokenFor = async (...args: Parameters<typeof tokensFor>) => (await tokensFor(...args)).access_token;

test('the schema the Worker makes is the one Better Auth migrates to for this configuration', async () => {
  assert.deepEqual(await schemaFor(), [...SCHEMA], 'run scripts/schema.ts after changing auth.ts or upgrading Better Auth');
});

test('an email code signs a person in, and the token names them and their customer', async () => {
  const { worker, personBy } = setup();
  const net = outside();
  try {
    // A person who is no customer's user yet is signed in all the same, to a token that names none,
    // so they can start a subscription (ADR-0017).
    const first = await emailSignIn(worker, 'Ada@Example.com', net.mail);
    assert.equal(first.done.status, 302);
    const none = await tokensFor(worker, first.done.headers.get('location')!, first.clientId, first.verifier);
    const person = personBy('ada@example.com')!;
    assert.ok(person);
    assert.deepEqual((await worker.validateToken(AUDIENCE, none.access_token))!.props, { person, customer: null });
    assert.ok(none.refresh_token, 'the connection can refresh its token');
    assert.deepEqual(await worker.customers(person), []);
    // The address the code proved is what activation without a checkout is decided by (CUS-03).
    assert.equal(await worker.email(person), 'ada@example.com');

    // The lifecycle makes acme for them at checkout, through the content server.
    await worker.addCustomer(person, 'acme');
    await worker.addCustomer(person, 'acme');
    assert.deepEqual(await worker.customers(person), ['acme']);

    const second = await emailSignIn(worker, 'ada@example.com', net.mail);
    assert.equal(second.done.status, 302);
    const token = await tokenFor(worker, second.done.headers.get('location')!, second.clientId, second.verifier);
    const valid = await worker.validateToken(AUDIENCE, token);
    assert.equal(valid!.userId, person);
    assert.deepEqual(valid!.props, { person, customer: 'acme' });
    assert.equal(valid!.audience, AUDIENCE);
    assert.ok(!token.includes('acme'));
    assert.equal(await worker.validateToken('https://elsewhere.example/mcp', token), null, 'a token works only for its audience');
    assert.equal(await worker.validateToken(AUDIENCE, 'not-a-token'), null);

  } finally {
    net.restore();
  }
});

test('a refreshed token names the same person and customer, after the sign-in ended', async () => {
  const { worker, personBy, db } = setup();
  const net = outside();
  try {
    await emailSignIn(worker, 'ada@example.com', net.mail);
    await worker.addCustomer(personBy('ada@example.com')!, 'acme');
    const signedIn = await emailSignIn(worker, 'ada@example.com', net.mail);
    const tokens = await tokensFor(worker, signedIn.done.headers.get('location')!, signedIn.clientId, signedIn.verifier);
    db.prepare('DELETE FROM "session"').run();
    assert.ok(await worker.validateToken(AUDIENCE, tokens.access_token), 'the token outlives the sign-in');
    const response = await worker.fetch(new Request(`${ISSUER}/oauth2/token`, {
      method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: tokens.refresh_token!, client_id: signedIn.clientId, resource: AUDIENCE }),
    }));
    assert.equal(response.status, 200, await response.clone().text());
    const refreshed = await response.json() as { access_token: string };
    assert.deepEqual((await worker.validateToken(AUDIENCE, refreshed.access_token))!.props, { person: personBy('ada@example.com'), customer: 'acme' });
  } finally {
    net.restore();
  }
});

test('a code is mailed from the issuer outside every unsubscribe group, and the page reads alike for any address', async () => {
  const { worker, personBy } = setup();
  const net = outside();
  try {
    const known = await emailSignIn(worker, 'ada@example.com', net.mail);
    await worker.addCustomer(personBy('ada@example.com')!, 'acme');
    const again = await emailSignIn(worker, 'ada@example.com', net.mail);
    const unknown = await emailSignIn(worker, 'nobody@example.com', net.mail);
    const strip = (html: string) => html.replace(/name="oauth_query" value="[^"]*"/, '').replace(/ada@example\.com|nobody@example\.com/g, 'ADDRESS');
    assert.equal(strip(again.codePage), strip(unknown.codePage));
    assert.equal(strip(known.codePage), strip(unknown.codePage));

    const sent = unknown.sent;
    assert.equal(sent.asm, undefined);
    assert.equal(sent.from.email, 'signin@cmokit.example');
    assert.deepEqual(sent.personalizations, [{ to: [{ email: 'nobody@example.com' }] }]);
    const auth = net.calls.find((c) => c.url.includes('sendgrid'))!.init!.headers as Record<string, string>;
    assert.equal(auth.authorization, 'Bearer sg-key');
  } finally {
    net.restore();
  }
});

test('a wrong code asks again, and after five wrong tries the code is locked', async () => {
  const { worker } = setup();
  const net = outside();
  try {
    const { html: signIn, go } = await open(worker);
    let html = await (await go('/sign-in', { form: { oauth_query: hidden(signIn, 'oauth_query'), way: 'email', address: 'ada@example.com' } })).text();
    const code = net.mail.at(-1).subject.slice(0, 6);
    const wrong = code === '000000' ? '111111' : '000000';
    for (let i = 1; i <= 5; i++) {
      const response = await go('/code', { form: { oauth_query: hidden(html, 'oauth_query'), address: 'ada@example.com', code: wrong } });
      html = await response.text();
      assert.match(html, /doesn&#39;t match/);
    }
    const late = await go('/code', { form: { oauth_query: hidden(html, 'oauth_query'), address: 'ada@example.com', code } });
    assert.match(await late.text(), /expired or was tried too many times/, 'the right code no longer works either');
  } finally {
    net.restore();
  }
});

test('codes sent from one network, and to one address, are limited', async () => {
  const { worker } = setup();
  const net = outside();
  try {
    let limited = false;
    for (let i = 0; i < 21; i++) {
      const { html: signIn, go } = await open(worker);
      const html = await (await go('/sign-in', { form: { oauth_query: hidden(signIn, 'oauth_query'), way: 'email', address: `person${i}@example.com` } })).text();
      if (/Too many codes/.test(html)) limited = true;
    }
    assert.equal(net.mail.length, 20);
    assert.ok(limited);

    const other = setup();
    const sent: string[] = [];
    for (let i = 0; i < 6; i++) {
      const { html: signIn, go } = await open(other.worker);
      const html = await (await go('/sign-in', { form: { oauth_query: hidden(signIn, 'oauth_query'), way: 'email', address: 'ada@example.com' } })).text();
      sent.push(/Too many codes/.test(html) ? 'limited' : 'sent');
    }
    assert.deepEqual(sent, ['sent', 'sent', 'sent', 'sent', 'sent', 'limited']);
  } finally {
    net.restore();
  }
});

test("a client naming any redirect but Claude's callback or a loopback address is refused", async () => {
  const { worker } = setup();
  assert.equal((await register(worker, [CLAUDE])).status, 201);
  assert.equal((await register(worker, ['http://localhost:4567/callback'])).status, 201);
  assert.equal((await register(worker, ['http://127.0.0.1:4567/callback'])).status, 201);
  assert.equal((await register(worker, ['https://evil.example/callback'])).status, 400);
  assert.equal((await register(worker, [CLAUDE, 'https://evil.example/callback'])).status, 400);
  assert.equal((await register(worker, ['http://evil.example/callback'])).status, 400);
});

test("Claude registers by its metadata document, and the sign-in screen names it by its domain", async () => {
  const { worker } = setup();
  const CLIENT = 'https://claude.ai/oauth/mcp-oauth-client-metadata';
  const net = outside({ [CLIENT]: { client_id: CLIENT, client_name: 'Claude', redirect_uris: [CLAUDE], token_endpoint_auth_method: 'none', grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'] } });
  try {
    const page = await browser(worker)(await authorizeUrl(CLIENT, CLAUDE, 'v'.repeat(64)));
    assert.equal(page.status, 200);
    assert.match(await page.text(), /<strong>Claude<\/strong>, from claude\.ai,/);
    const elsewhere = await browser(worker)(await authorizeUrl(CLIENT, 'https://evil.example/callback', 'v'.repeat(64)));
    assert.equal(elsewhere.status, 400);
  } finally {
    net.restore();
  }
});

test('the metadata names the endpoints, and nothing else of Better Auth answers from outside', async () => {
  const { worker } = setup();
  const response = await worker.fetch(new Request(`${ISSUER}/.well-known/oauth-authorization-server`));
  assert.equal(response.status, 200);
  const metadata = await response.json() as Record<string, unknown>;
  assert.equal(metadata.issuer, ISSUER);
  assert.equal(metadata.authorization_endpoint, `${ISSUER}/oauth2/authorize`);
  assert.equal(metadata.token_endpoint, `${ISSUER}/oauth2/token`);
  assert.equal(metadata.registration_endpoint, `${ISSUER}/oauth2/register`);
  assert.equal(metadata.client_id_metadata_document_supported, true);
  for (const path of ['/get-session', '/sign-up/email', '/list-accounts', '/oauth2/get-clients', '/sign-in/social']) {
    assert.equal((await worker.fetch(new Request(`${ISSUER}${path}`))).status, 404, path);
    assert.equal((await worker.fetch(new Request(`${ISSUER}${path}`, { method: 'POST', body: '{}', headers: { 'content-type': 'application/json' } }))).status, 404, path);
  }
});

test('Google, GitHub and Facebook are offered only when configured, ask for identity alone, and come back to the one callback', async () => {
  const bare = setup({ SENDGRID_API_KEY: undefined });
  const { html: page } = await open(bare.worker);
  assert.doesNotMatch(page, /Continue with|Email me a code/);

  const { worker } = setup({ GOOGLE_CLIENT_ID: 'g-id', GOOGLE_CLIENT_SECRET: 'g-secret', GITHUB_CLIENT_ID: 'h-id', GITHUB_CLIENT_SECRET: 'h-secret', META_APP_ID: 'm-id', META_APP_SECRET: 'm-secret' });
  const scopes: Record<string, string[]> = {};
  for (const way of ['google', 'github', 'facebook']) {
    const { html: signIn, go } = await open(worker);
    const response = await go('/sign-in', { form: { oauth_query: hidden(signIn, 'oauth_query'), way } });
    assert.equal(response.status, 302);
    const location = new URL(response.headers.get('location')!);
    assert.equal(location.searchParams.get('redirect_uri'), `${ISSUER}/callback`);
    assert.ok(location.searchParams.get('state'));
    scopes[location.origin] = location.searchParams.get('scope')!.split(/[ ,]/).sort();
  }
  assert.deepEqual(scopes, {
    'https://accounts.google.com': ['email', 'openid', 'profile'],
    'https://github.com': ['read:user', 'user:email'],
    'https://www.facebook.com': ['email', 'public_profile'],
  });
});

test('signing in with Google at an address an email code proved reaches the same account', async () => {
  const { worker, personBy, db } = setup({ GOOGLE_CLIENT_ID: 'g-id', GOOGLE_CLIENT_SECRET: 'g-secret' });
  const net = outside({
    'https://oauth2.googleapis.com/token': { access_token: 'google-access', id_token: googleIdToken({ sub: 'g-123', email: 'ada@example.com', email_verified: true }) },
  });
  try {
    await emailSignIn(worker, 'ada@example.com', net.mail);
    const { html: signIn, go, clientId, verifier } = await open(worker);
    const away = await go('/sign-in', { form: { oauth_query: hidden(signIn, 'oauth_query'), way: 'google' } });
    const state = new URL(away.headers.get('location')!).searchParams.get('state')!;
    const back = await go(`/callback?${new URLSearchParams({ state, code: 'google-code' })}`);
    assert.equal(back.status, 302, await back.clone().text());
    const token = await tokenFor(worker, back.headers.get('location')!, clientId, verifier);
    const exchange = net.calls.find((c) => c.url === 'https://oauth2.googleapis.com/token')!;
    const sent = new URLSearchParams(String(exchange.init!.body));
    assert.equal(sent.get('code'), 'google-code');
    assert.ok(sent.get('code_verifier'));
    const person = personBy('ada@example.com')!;
    assert.equal((await worker.validateToken(AUDIENCE, token))!.userId, person);
    assert.deepEqual(await worker.waysIn(person), ['email:ada@example.com', 'google:g-123']);
    // No provider's token is kept.
    assert.deepEqual(db.prepare('SELECT accessToken, refreshToken, idToken FROM account').all().map((r) => ({ ...r })), [{ accessToken: null, refreshToken: null, idToken: null }]);
  } finally {
    net.restore();
  }
});

/** An unsigned ID token: Better Auth reads Google's profile from the token its token endpoint returned. */
function googleIdToken(claims: Record<string, unknown>): string {
  const part = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${part({ alg: 'none' })}.${part({ iss: 'https://accounts.google.com', aud: 'g-id', exp: Math.floor(Date.now() / 1000) + 600, ...claims })}.`;
}

test('a provider that sends the person back with an error says the sign-in did not go on', async () => {
  const { worker } = setup({ GITHUB_CLIENT_ID: 'h-id', GITHUB_CLIENT_SECRET: 'h-secret' });
  const { html: signIn, go } = await open(worker);
  const away = await go('/sign-in', { form: { oauth_query: hidden(signIn, 'oauth_query'), way: 'github' } });
  const state = new URL(away.headers.get('location')!).searchParams.get('state')!;
  const back = await go(`/callback?${new URLSearchParams({ state, error: 'access_denied' })}`);
  assert.equal(back.status, 400);
  assert.match(await back.text(), /Signing in was cancelled/);
  assert.equal((await go(`/callback?${new URLSearchParams({ state, code: 'x' })}`)).status, 400, 'the callback works once');
});

test('a person with two customers chooses which one this connection serves', async () => {
  const { worker, personBy } = setup();
  const net = outside();
  try {
    await emailSignIn(worker, 'ada@example.com', net.mail);
    const person = personBy('ada@example.com')!;
    await worker.addCustomer(person, 'acme');
    await worker.addCustomer(person, 'globex', 'Globex');
    const { done, go } = await emailSignIn(worker, 'ada@example.com', net.mail);
    const chooser = await done.text();
    // Each brand is shown by the name the person gave it; one never named says so.
    assert.match(chooser, /value="acme"[^>]*> Unnamed brand</);
    assert.match(chooser, /value="globex"[^>]*> Globex</);

    const forged = await go('/choose', { form: { oauth_query: hidden(chooser, 'oauth_query'), customer: 'initech' } });
    assert.equal(forged.status, 400);

    const again = await emailSignIn(worker, 'ada@example.com', net.mail);
    const chosen = await again.go('/choose', { form: { oauth_query: hidden(await again.done.text(), 'oauth_query'), customer: 'globex' } });
    assert.equal(chosen.status, 302);
    const token = await tokenFor(worker, chosen.headers.get('location')!, again.clientId, again.verifier);
    assert.deepEqual((await worker.validateToken(AUDIENCE, token))!.props, { person, customer: 'globex' });
    assert.equal(await worker.nameCustomer(person, 'acme', 'Acme'), true);
    assert.equal(await worker.nameCustomer(person, 'initech', 'Initech'), false);
    assert.deepEqual(await worker.brands(person), [{ slug: 'acme', name: 'Acme' }, { slug: 'globex', name: 'Globex' }]);
  } finally {
    net.restore();
  }
});

test('a sign-in form posted from another site is refused, a tampered request is refused, and Cancel tells Claude', async () => {
  const { worker } = setup();
  const net = outside();
  try {
    const { html: signIn, go } = await open(worker);
    const elsewhere = await go('/sign-in', { form: { oauth_query: hidden(signIn, 'oauth_query'), way: 'email', address: 'ada@example.com' }, origin: 'https://evil.example' });
    assert.equal(elsewhere.status, 403);
    // A request whose signed query was changed never reaches Claude, even with the right code.
    const tampered = await go('/sign-in', { form: { oauth_query: hidden(signIn, 'oauth_query').replace('claude-state', 'other-state'), way: 'email', address: 'ada@example.com' } });
    const codePage = await tampered.text();
    const after = await go('/code', { form: { oauth_query: hidden(codePage, 'oauth_query'), address: 'ada@example.com', code: net.mail.at(-1)?.subject.slice(0, 6) ?? '' } });
    assert.ok(after.status >= 400, `status ${after.status}`);
    assert.ok(!(after.headers.get('location') ?? '').startsWith(CLAUDE));

    const cancelled = await go('/sign-in', { form: { oauth_query: hidden(signIn, 'oauth_query'), way: 'cancel' } });
    const back = new URL(cancelled.headers.get('location')!);
    assert.equal(back.origin + back.pathname, CLAUDE);
    assert.equal(back.searchParams.get('error'), 'access_denied');
    assert.equal(back.searchParams.get('state'), 'claude-state');
  } finally {
    net.restore();
  }
});

test('the sign-in page cannot be framed, and escapes what the client says about itself', async () => {
  const { worker } = setup();
  const { body: client } = await register(worker, [CLAUDE], '<script>x</script>');
  const page = await browser(worker)(await authorizeUrl(client.client_id!, CLAUDE, 'v'.repeat(64)));
  assert.equal(page.headers.get('x-frame-options'), 'DENY');
  const html = await page.text();
  assert.doesNotMatch(html, /<script>x/);
  assert.match(html, /name isn't verified/);
});

test("the account page's callback is allowed only where the deployment names it", async () => {
  const { allowedRedirect } = await import('../src/index.ts');
  const { appRedirects } = await import('../src/worker.ts');
  const extra = appRedirects({ APP_URL: 'https://app.cmokit.ai' } as Parameters<typeof appRedirects>[0]);
  assert.deepEqual(extra, ['https://app.cmokit.ai/callback']);
  assert.equal(allowedRedirect('https://app.cmokit.ai/callback', extra), true);
  assert.equal(allowedRedirect('https://app.cmokit.ai/callback'), false);
  assert.equal(allowedRedirect('https://app.cmokit.ai/elsewhere', extra), false);
  assert.deepEqual(appRedirects({} as Parameters<typeof appRedirects>[0]), []);
});

const TERMS = { TERMS_URL: 'https://cmokit.example/beta-terms/' };
const TERMS_PAGE = { 'https://cmokit.example/beta-terms/': '<main><h1>Beta terms</h1><p>Version 2026-11-11</p></main>' };

test('while terms are asked for, no way in goes on until the box is ticked, and the token carries the version ticked', async () => {
  const { worker, personBy } = setup(TERMS);
  const net = outside(TERMS_PAGE);
  try {
    const { html: signIn, go, clientId, verifier } = await open(worker);
    assert.match(signIn, /<input type="checkbox" name="terms" value="yes" required>/);
    assert.match(signIn, /href="https:\/\/cmokit\.example\/beta-terms\/"/);
    assert.match(signIn, /version 2026-11-11/);
    assert.match(signIn, /value="cancel" formnovalidate/, 'Cancel needs no tick');

    // Without the tick, nothing is sent and the screen asks again.
    const refused = await go('/sign-in', { form: { oauth_query: hidden(signIn, 'oauth_query'), way: 'email', address: 'ada@example.com' } });
    assert.equal(refused.status, 400);
    const again = await refused.text();
    assert.match(again, /Tick the box to accept the beta terms/);
    assert.equal(net.mail.length, 0);

    const codePage = await (await go('/sign-in', { form: { oauth_query: hidden(again, 'oauth_query'), way: 'email', address: 'ada@example.com', terms: 'yes' } })).text();
    const done = await go('/code', { form: { oauth_query: hidden(codePage, 'oauth_query'), address: 'ada@example.com', code: net.mail.at(-1).subject.slice(0, 6) } });
    const token = await tokenFor(worker, done.headers.get('location')!, clientId, verifier);
    assert.deepEqual((await worker.validateToken(AUDIENCE, token))!.props, { person: personBy('ada@example.com'), customer: null, terms: '2026-11-11' });
  } finally {
    net.restore();
  }
});

test('without terms, the sign-in screen has no box and the token names no version', async () => {
  const { worker } = setup();
  const { html: signIn } = await open(worker);
  assert.doesNotMatch(signIn, /name="terms"/);
  assert.match(signIn, /keeps only who you are\. It keeps no password/);
});

test('a person with two brands who ticked the terms keeps the version through choosing a brand', async () => {
  const { worker, personBy } = setup(TERMS);
  const net = outside(TERMS_PAGE);
  try {
    await emailSignIn(worker, 'ada@example.com', net.mail, { terms: 'yes' });
    const person = personBy('ada@example.com')!;
    await worker.addCustomer(person, 'acme');
    await worker.addCustomer(person, 'globex');
    const again = await emailSignIn(worker, 'ada@example.com', net.mail, { terms: 'yes' });
    const chosen = await again.go('/choose', { form: { oauth_query: hidden(await again.done.text(), 'oauth_query'), customer: 'globex' } });
    const token = await tokenFor(worker, chosen.headers.get('location')!, again.clientId, again.verifier);
    assert.deepEqual((await worker.validateToken(AUDIENCE, token))!.props, { person, customer: 'globex', terms: '2026-11-11' });
  } finally {
    net.restore();
  }
});

const META_APP = { INSTAGRAM_APP_ID: 'ig-app', INSTAGRAM_APP_SECRET: 'ig-secret', INSTAGRAM_CONFIG_ID: 'ig-config' };

function meta(account: { id: string; username: string }, user: string) {
  return {
    'https://graph.facebook.com/v27.0/oauth/access_token': { access_token: 'ig-access' },
    'https://graph.facebook.com/v27.0/me?': { id: user },
    'https://graph.facebook.com/v27.0/me/assigned_instagram_accounts': { data: [account] },
  };
}

/** Signs in with Instagram from Claude's first request, with Meta answering for the given login and account. */
async function instagramSignIn(worker: any, account: { id: string; username: string }, user = 'meta-ada', go?: Go, redirect = CLAUDE, extra: Record<string, string> = {}) {
  const net = outside(meta(account, user));
  try {
    const opened = await open(worker, go, redirect, extra);
    const away = await opened.go('/sign-in', { form: { oauth_query: hidden(opened.html, 'oauth_query'), way: 'instagram' } });
    const location = new URL(away.headers.get('location')!);
    const back = await opened.go(`/callback?${new URLSearchParams({ state: location.searchParams.get('state')!, code: 'ig-code' })}`);
    return { ...opened, location, back, calls: net.calls };
  } finally {
    net.restore();
  }
}

test('Instagram leads the sign-in screen, goes through the Unified Login configuration, and names the person by their own Meta login', async () => {
  const { worker } = setup({ ...META_APP, GITHUB_CLIENT_ID: 'h-id', GITHUB_CLIENT_SECRET: 'h-secret' });
  const first = await instagramSignIn(worker, { id: '17841400000000001', username: 'Ada.Makes' });
  assert.ok(first.html.indexOf('value="instagram" class="primary"') < first.html.indexOf('value="github"'), 'Instagram is the first, primary button');
  assert.match(first.html, /<button name="way" value="github">Continue with GitHub<\/button>/);
  assert.equal(first.location.origin + first.location.pathname, 'https://www.facebook.com/dialog/oauth');
  assert.equal(first.location.searchParams.get('config_id'), 'ig-config');
  assert.equal(first.location.searchParams.get('client_id'), 'ig-app');
  assert.equal(first.location.searchParams.get('redirect_uri'), `${ISSUER}/callback`);
  assert.ok(!first.location.searchParams.get('scope'), 'the configuration, not a scope list, says what Meta asks for');
  const exchange = new URL(first.calls.find((c) => c.url.startsWith('https://graph.facebook.com/v27.0/oauth/access_token'))!.url);
  assert.equal(exchange.searchParams.get('code'), 'ig-code');
  assert.equal(first.back.status, 302, await first.back.clone().text());
  const token = await tokenFor(worker, first.back.headers.get('location')!, first.clientId, first.verifier);

  const { props } = (await worker.validateToken(AUDIENCE, token))!;
  assert.deepEqual(await worker.waysIn(props.person), ['instagram:meta-ada']);
  assert.deepEqual(await worker.instagram(props.person), { id: '17841400000000001', handle: 'ada.makes' });
  assert.equal(await worker.email(props.person), null, 'Instagram proves no email address');

  // A changed handle is the same person, found by their Meta login, with the handle they have now.
  const again = await instagramSignIn(worker, { id: '17841400000000001', username: 'ada_creates' });
  const later = (await worker.validateToken(AUDIENCE, await tokenFor(worker, again.back.headers.get('location')!, again.clientId, again.verifier)))!.props;
  assert.equal(later.person, props.person);
  assert.deepEqual(await worker.instagram(props.person), { id: '17841400000000001', handle: 'ada_creates' });

  // Someone else who manages the same business account is someone else.
  const other = await instagramSignIn(worker, { id: '17841400000000001', username: 'ada_creates' }, 'meta-bea');
  assert.notEqual((await worker.validateToken(AUDIENCE, await tokenFor(worker, other.back.headers.get('location')!, other.clientId, other.verifier)))!.props.person, props.person);
});

const APP = 'https://app.example';

/**
 * Adds a way in from the account page: the page's own client sends the link the issuer gave it to
 * the sign-in, and signing in there finishes it.
 */
async function addEmail(worker: any, link: string, address: string, mail: any[]) {
  const opened = await open(worker, undefined, `${APP}/callback`, { link });
  const codePage = await (await opened.go('/sign-in', { form: { oauth_query: hidden(opened.html, 'oauth_query'), way: 'email', address } })).text();
  const done = await opened.go('/code', { form: { oauth_query: hidden(codePage, 'oauth_query'), address, code: mail.at(-1).subject.slice(0, 6) } });
  return { signIn: opened.html, done };
}

test('a way in added from the account page reaches the same account, and an empty account that held it is deleted', async () => {
  const { worker, personBy } = setup({ ...META_APP, APP_URL: APP });
  const net = outside();
  try {
    // A creator signed in with Instagram, with a brand.
    const signedIn = await instagramSignIn(worker, { id: '17841400000000001', username: 'ada.makes' });
    const ada = (await worker.validateToken(AUDIENCE, await tokenFor(worker, signedIn.back.headers.get('location')!, signedIn.clientId, signedIn.verifier)))!.userId;
    await worker.addCustomer(ada, 'acme');

    // An address that signed in to an account with nothing in it: that account goes, and the address
    // becomes the creator's.
    await emailSignIn(worker, 'ada@example.com', net.mail);
    const empty = personBy('ada@example.com')!;
    assert.notEqual(empty, ada);
    const added = await addEmail(worker, await worker.startLink(ada), 'ada@example.com', net.mail);
    assert.match(added.signIn, /Add a way in/);
    assert.equal(added.done.status, 302);
    assert.equal(added.done.headers.get('location'), `${APP}/`);
    assert.equal(personBy('ada@example.com'), ada);
    assert.deepEqual(await worker.waysIn(empty), []);
    assert.deepEqual(await worker.waysIn(ada), ['email:ada@example.com', 'instagram:meta-ada']);
    assert.equal(await worker.email(ada), 'ada@example.com');

    // A second address is not added: an account keeps one.
    const second = await addEmail(worker, await worker.startLink(ada), 'ada@work.example', net.mail);
    assert.equal(second.done.status, 409);
    assert.match(await second.done.text(), /already signs in with an email address/);
    assert.equal(await worker.email(ada), 'ada@example.com');

    // Signing in with the address now reaches the creator's account.
    const again = await emailSignIn(worker, 'ada@example.com', net.mail);
    assert.deepEqual((await worker.validateToken(AUDIENCE, await tokenFor(worker, again.done.headers.get('location')!, again.clientId, again.verifier)))!.props, { person: ada, customer: 'acme' });
  } finally {
    net.restore();
  }
});

test('a way in that reaches an account with brands is not added, and a link works once and not after it expires', async () => {
  const { worker, personBy, db } = setup({ ...META_APP, APP_URL: APP });
  const net = outside();
  try {
    const signedIn = await instagramSignIn(worker, { id: '17841400000000001', username: 'ada.makes' });
    const ada = (await worker.validateToken(AUDIENCE, await tokenFor(worker, signedIn.back.headers.get('location')!, signedIn.clientId, signedIn.verifier)))!.userId;
    await emailSignIn(worker, 'bea@example.com', net.mail);
    const bea = personBy('bea@example.com')!;
    await worker.addCustomer(bea, 'globex');

    const refused = await addEmail(worker, await worker.startLink(ada), 'bea@example.com', net.mail);
    assert.equal(refused.done.status, 409);
    assert.match(await refused.done.text(), /already reaches another CMOKit account that has brands/);
    assert.equal(personBy('bea@example.com'), bea);

    const link = await worker.startLink(ada);
    await addEmail(worker, link, 'ada@example.com', net.mail);
    const reused = await addEmail(worker, link, 'ada@other.example', net.mail);
    assert.match(await reused.done.text(), /This page expired/);
    assert.notEqual(personBy('ada@other.example'), ada);

    const stale = await worker.startLink(ada);
    db.prepare('UPDATE "wayLink" SET "expiresAt" = ?').run(Date.now() - 1);
    const expired = await addEmail(worker, stale, 'ada@late.example', net.mail);
    assert.match(await expired.done.text(), /This page expired/);
    assert.notEqual(personBy('ada@late.example'), ada);
  } finally {
    net.restore();
  }
});

test("Google is not offered in Instagram's or Facebook's in-app browser, where it refuses to sign anyone in", async () => {
  const { worker } = setup({ ...META_APP, GOOGLE_CLIENT_ID: 'g-id', GOOGLE_CLIENT_SECRET: 'g-secret' });
  const { body: client } = await register(worker, [CLAUDE]);
  const url = await authorizeUrl(client.client_id!, CLAUDE, 'v'.repeat(64));
  const safari = await (await browser(worker)(url)).text();
  assert.match(safari, /Continue with Google/);
  for (const agent of ['Mozilla/5.0 (iPhone) AppleWebKit/605.1.15 Mobile/15E148 Instagram 312.0.0.0', 'Mozilla/5.0 (iPhone) Mobile/15E148 [FBAN/FBIOS;FBAV/450.0]']) {
    const inApp = await (await browser(worker, agent)(url)).text();
    assert.doesNotMatch(inApp, /Continue with Google/);
    assert.match(inApp, /Continue with Instagram/);
  }
});

test('deleting a person erases their records, old and new, and every token issued to them', async () => {
  const { worker, personBy, people, identities, grants } = setup();
  const net = outside();
  try {
    const signedIn = await emailSignIn(worker, 'ada@example.com', net.mail);
    const tokens = await tokensFor(worker, signedIn.done.headers.get('location')!, signedIn.clientId, signedIn.verifier);
    const person = (await worker.validateToken(AUDIENCE, tokens.access_token))!.userId;
    await worker.addCustomer(person, 'acme');
    // Records of the same person from before Better Auth.
    await call(identities, 'email:ada@example.com', 'claim', person);
    await call(people, person, 'addIdentity', 'email:ada@example.com', 'ada@example.com', 0);
    grants.store.set(`grant:${person}:g1`, '{}');

    await worker.deletePerson(person);
    assert.equal(await worker.validateToken(AUDIENCE, tokens.access_token), null, 'the token no longer works');
    const refresh = await worker.fetch(new Request(`${ISSUER}/oauth2/token`, {
      method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: tokens.refresh_token!, client_id: signedIn.clientId }),
    }));
    assert.notEqual(refresh.status, 200, 'nor does its refresh token');
    assert.deepEqual(await worker.customers(person), []);
    assert.equal(await worker.email(person), null);
    assert.equal(personBy('ada@example.com'), null);
    assert.equal(await call(identities, 'email:ada@example.com', 'person'), null, 'the old record names no one');
    assert.deepEqual(await call(people, person, 'identities'), []);
    assert.equal(grants.store.size, 0);
    await worker.deletePerson(person);

    // Signing in again at the same address makes a new person, with no brands.
    const again = await emailSignIn(worker, 'ada@example.com', net.mail);
    const next = (await worker.validateToken(AUDIENCE, await tokenFor(worker, again.done.headers.get('location')!, again.clientId, again.verifier)))!;
    assert.notEqual(next.userId, person);
    assert.deepEqual(next.props, { person: next.userId, customer: null });
  } finally {
    net.restore();
  }
});

test('people are copied from the old records once, with their ids, ways in, address, brands and Instagram account', async () => {
  const { worker, people, grants } = setup({ ...META_APP });
  // Ada signed in with an email code and then GitHub; Cy with Instagram; Dee deleted her account.
  await call(people, 'ada-id', 'addIdentity', 'email:ada@example.com', 'ada@example.com', 1);
  await call(people, 'ada-id', 'addIdentity', 'github:4242', null, 2);
  await call(people, 'ada-id', 'addCustomer', 'acme', 1, 'Acme');
  await call(people, 'ada-id', 'addCustomer', 'globex', 2);
  await call(people, 'cy-id', 'addIdentity', 'instagram:meta-cy', null, 1, { id: '17841400000000009', handle: 'cy.makes' });
  await call(people, 'cy-id', 'addCustomer', 'cyco', 1);
  for (const key of ['grant:ada-id:g1', 'grant:ada-id:g2', 'grant:cy-id:g3', 'grant:dee-id:g4']) grants.store.set(key, '{}');

  const copy = (token: string, body: unknown = {}) => worker.fetch(new Request(`${ISSUER}/copy`, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(body) }));
  assert.equal((await copy('wrong')).status, 404, 'only the deploy, holding the derived token, runs it');
  const token = await derivedKey(KEY, 'cmokit copy');
  const first = await copy(token);
  assert.equal(first.status, 200);
  const report = await first.json() as Record<string, unknown>;
  assert.deepEqual(report, { copied: ['ada-id', 'cy-id'], alreadyCopied: [], empty: ['dee-id'], failed: [], skipped: [] });
  assert.ok(!JSON.stringify(report).includes('@'), 'the report names no address');

  assert.equal(await worker.email('ada-id'), 'ada@example.com');
  assert.deepEqual(await worker.waysIn('ada-id'), ['email:ada@example.com', 'github:4242']);
  assert.deepEqual(await worker.brands('ada-id'), [{ slug: 'acme', name: 'Acme' }, { slug: 'globex', name: null }]);
  assert.deepEqual(await worker.waysIn('cy-id'), ['instagram:meta-cy']);
  assert.deepEqual(await worker.instagram('cy-id'), { id: '17841400000000009', handle: 'cy.makes' });
  assert.equal(await worker.email('cy-id'), null);

  // Running it again changes nothing.
  assert.deepEqual(await (await copy(token, { people: ['cy-id'] })).json(), { copied: [], alreadyCopied: ['ada-id', 'cy-id'], empty: ['dee-id'], failed: [], skipped: [] });

  // A copied person signs in to their own account, with their own id and brand.
  const signedIn = await instagramSignIn(worker, { id: '17841400000000009', username: 'cy.makes' }, 'meta-cy');
  const props = (await worker.validateToken(AUDIENCE, await tokenFor(worker, signedIn.back.headers.get('location')!, signedIn.clientId, signedIn.verifier)))!.props;
  assert.deepEqual(props, { person: 'cy-id', customer: 'cyco' });
});

test('the copy keeps the first person who proved an address, and reports what it could not copy', async () => {
  const { worker, people, grants } = setup();
  await call(people, 'one', 'addIdentity', 'email:ada@example.com', 'ada@example.com', 1);
  await call(people, 'two', 'addIdentity', 'google:g-1', 'ada@example.com', 1);
  await call(people, 'two', 'addIdentity', 'email:ada@example.com', null, 2);
  for (const key of ['grant:one:a', 'grant:two:b']) grants.store.set(key, '{}');
  const response = await worker.fetch(new Request(`${ISSUER}/copy`, { method: 'POST', headers: { authorization: `Bearer ${await derivedKey(KEY, 'cmokit copy')}` } }));
  assert.deepEqual(await response.json(), {
    copied: ['one', 'two'], alreadyCopied: [], empty: [], failed: [],
    skipped: [{ person: 'two', identity: 'email', reason: 'an address another person has' }],
  });
  assert.equal(await worker.email('one'), 'ada@example.com');
  assert.equal(await worker.email('two'), null);
  assert.deepEqual(await worker.waysIn('two'), ['google:g-1']);
});

test("the account page's own client, which asks for no refresh token, signs a person in", async () => {
  const { worker } = setup({ APP_URL: APP });
  const CLIENT = `${APP}/client.json`;
  const net = outside({ [CLIENT]: { client_id: CLIENT, client_name: 'CMOKit account', client_uri: APP, redirect_uris: [`${APP}/callback`], grant_types: ['authorization_code'], response_types: ['code'], token_endpoint_auth_method: 'none' } });
  try {
    const verifier = 'w'.repeat(64);
    const go = browser(worker);
    const signIn = await (await go(await authorizeUrl(CLIENT, `${APP}/callback`, verifier))).text();
    const codePage = await (await go('/sign-in', { form: { oauth_query: hidden(signIn, 'oauth_query'), way: 'email', address: 'ada@example.com' } })).text();
    const done = await go('/code', { form: { oauth_query: hidden(codePage, 'oauth_query'), address: 'ada@example.com', code: net.mail.at(-1).subject.slice(0, 6) } });
    assert.equal(done.status, 302, await done.clone().text());
    const tokens = await tokensFor(worker, done.headers.get('location')!, CLIENT, verifier, `${APP}/callback`);
    assert.ok(await worker.validateToken(AUDIENCE, tokens.access_token));
  } finally {
    net.restore();
  }
});
