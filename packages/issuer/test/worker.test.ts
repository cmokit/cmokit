// The issuer's Worker on Node, with Cloudflare's OAuth library itself, a stand-in for its KV
// namespace and for the Durable Object namespaces, and stand-ins for each provider and for SendGrid.
// Every sign-in goes from Claude's authorization request to a token the content server's check
// accepts, as ADR-0018's confirmation lists.

import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';

// The library and the Worker import the Workers runtime's entrypoint class; on Node it is a stand-in.
registerHooks({
  resolve(specifier, context, next) {
    if (specifier === 'cloudflare:workers') {
      return { url: 'data:text/javascript,export class WorkerEntrypoint { constructor(ctx, env) { this.ctx = ctx; this.env = env; } }', shortCircuit: true };
    }
    return next(specifier, context);
  },
});

const { authorizationServer, createIssuerWorker } = await import('../src/worker.ts');
type Env = import('../src/worker.ts').IssuerEnv;

const ISSUER = 'https://auth.example';
const AUDIENCE = 'https://content.example/mcp';
const CLAUDE = 'https://claude.ai/api/mcp/auth_callback';

function kv() {
  const store = new Map<string, { value: string; metadata?: unknown }>();
  return {
    async get(key: string, type?: string | { type?: string }) {
      const entry = store.get(key);
      if (!entry) return null;
      const kind = typeof type === 'string' ? type : type?.type;
      return kind === 'json' ? JSON.parse(entry.value) : entry.value;
    },
    async put(key: string, value: string, options?: { metadata?: unknown }) {
      store.set(key, { value, metadata: options?.metadata });
    },
    async delete(key: string) {
      store.delete(key);
    },
    async list(options: { prefix?: string } = {}) {
      const keys = [...store.entries()].filter(([k]) => k.startsWith(options.prefix ?? '')).map(([name, e]) => ({ name, metadata: e.metadata }));
      return { keys, list_complete: true, cursor: '' };
    },
  };
}

function namespace(Class: new (ctx: any, env: unknown) => { fetch(r: Request): Promise<Response> }) {
  const objects = new Map<string, { fetch(r: Request): Promise<Response> }>();
  const dbs = new Map<string, DatabaseSync>();
  return {
    dbs,
    idFromName: (name: string) => name,
    get: (id: unknown) => ({
      fetch: (input: string, init?: RequestInit) => {
        let object = objects.get(id as string);
        if (!object) {
          const db = new DatabaseSync(':memory:');
          dbs.set(id as string, db);
          object = new Class({ storage: { sql: { exec: (q: string, ...p: unknown[]) => ({ toArray: () => db.prepare(q).all(...(p as never[])) }) } } }, {});
          objects.set(id as string, object);
        }
        return object.fetch(new Request(input, init));
      },
    }),
  };
}

/** A browser: keeps the issuer's cookies, and never follows a redirect by itself. */
function browser(worker: { fetch(r: Request): Promise<Response> }) {
  const jar = new Map<string, string>();
  return async (path: string, init: RequestInit & { form?: Record<string, string> } = {}) => {
    const headers = new Headers(init.headers);
    if (jar.size) headers.set('cookie', [...jar].map(([k, v]) => `${k}=${v}`).join('; '));
    headers.set('cf-connecting-ip', '203.0.113.7');
    let body = init.body;
    if (init.form) {
      body = new URLSearchParams(init.form);
      headers.set('content-type', 'application/x-www-form-urlencoded');
    }
    const response = await worker.fetch(new Request(new URL(path, ISSUER), { method: init.method ?? (init.form ? 'POST' : 'GET'), headers, body }));
    for (const cookie of response.headers.getSetCookie()) {
      const [pair] = cookie.split(';');
      const [name, value] = [pair.slice(0, pair.indexOf('=')), pair.slice(pair.indexOf('=') + 1)];
      if (/max-age=0/i.test(cookie) || value === '') jar.delete(name);
      else jar.set(name, value);
    }
    return response;
  };
}

const hidden = (html: string, name: string) => html.match(new RegExp(`name="${name}" value="([^"]+)"`))?.[1] ?? '';
const stateIn = (html: string) => decodeURIComponent(html.match(/\?state=([^"]+)"/)?.[1] ?? '');

async function s256(verifier: string) {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
  return btoa(String.fromCharCode(...digest)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function setup(extra: Partial<Env> = {}) {
  const { Issuer, Identity, Person } = createIssuerWorker();
  const people = namespace(Person);
  const identities = namespace(Identity);
  const env = {
    OAUTH_KV: kv(), IDENTITIES: identities, PEOPLE: people, ISSUER_URL: ISSUER, AUDIENCE,
    SENDGRID_API_KEY: 'sg-key', MAIL_FROM: 'signin@cmokit.example', ...extra,
  } as Env;
  const worker = new Issuer({ waitUntil() {}, passThroughOnException() {} }, env) as unknown as InstanceType<typeof Issuer> & { fetch(r: Request): Promise<Response> };
  const addCustomer = async (person: string, slug: string, name?: string) => {
    await people.get(person).fetch('https://object/addCustomer', { method: 'POST', body: JSON.stringify(name ? [slug, 0, name] : [slug, 0]) });
  };
  return { worker, env, people, identities, addCustomer };
}

/** Records SendGrid's mail and stands in for the providers, behind the global fetch. */
function outside(answers: Record<string, unknown> = {}) {
  const mail: any[] = [];
  const calls: { url: string; init?: RequestInit }[] = [];
  const real = globalThis.fetch;
  globalThis.fetch = async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    calls.push({ url, init });
    if (url === 'https://api.sendgrid.com/v3/mail/send') {
      mail.push(JSON.parse(String(init?.body)));
      return new Response(null, { status: 202 });
    }
    const answer = Object.entries(answers).find(([prefix]) => url.startsWith(prefix));
    if (answer) return Response.json(answer[1]);
    throw new Error(`unexpected fetch ${url}`);
  };
  return { mail, calls, restore: () => { globalThis.fetch = real; } };
}

async function register(worker: { fetch(r: Request): Promise<Response> }, redirects: string[]) {
  const response = await worker.fetch(new Request(`${ISSUER}/register`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ client_name: 'Claude Code', redirect_uris: redirects, token_endpoint_auth_method: 'none', grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'] }),
  }));
  return { status: response.status, body: await response.json() as { client_id?: string } };
}

async function authorizeUrl(clientId: string, redirect: string, verifier: string) {
  return `/authorize?${new URLSearchParams({
    response_type: 'code', client_id: clientId, redirect_uri: redirect, state: 'claude-state',
    code_challenge: await s256(verifier), code_challenge_method: 'S256', resource: AUDIENCE,
  })}`;
}

/** Signs in by email code from Claude's first request to the page that follows the right code. */
async function emailSignIn(worker: any, address: string, mail: any[], extra: Record<string, string> = {}) {
  const verifier = 'v'.repeat(64);
  const { body: client } = await register(worker, [CLAUDE]);
  const go = browser(worker);
  const page = await go(await authorizeUrl(client.client_id!, CLAUDE, verifier));
  assert.equal(page.status, 200);
  const signIn = await page.text();
  const codePage = await go('/authorize', { form: { handle: hidden(signIn, 'handle'), way: 'email', address, ...extra } });
  const html = await codePage.text();
  const sent = mail.at(-1);
  const code = sent.subject.slice(0, 6);
  const done = await go(`/code?state=${encodeURIComponent(stateIn(html))}`, { form: { code } });
  return { done, go, verifier, clientId: client.client_id!, codePage: html, sent };
}

async function tokenFor(worker: any, location: string, clientId: string, verifier: string) {
  const url = new URL(location);
  assert.equal(url.origin + url.pathname, CLAUDE);
  assert.equal(url.searchParams.get('state'), 'claude-state');
  assert.equal(url.searchParams.get('iss'), ISSUER);
  const response = await worker.fetch(new Request(`${ISSUER}/oauth/token`, {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'authorization_code', code: url.searchParams.get('code')!, redirect_uri: CLAUDE, client_id: clientId, code_verifier: verifier, resource: AUDIENCE }),
  }));
  assert.equal(response.status, 200);
  return (await response.json() as { access_token: string }).access_token;
}

test('an email code signs a person in, and the token names them and their customer', async () => {
  const { worker, identities } = setup();
  const net = outside();
  try {
    // A person who is no customer's user yet is signed in all the same, to a grant that names none,
    // so they can start a subscription (ADR-0017).
    const first = await emailSignIn(worker, 'Ada@Example.com', net.mail);
    assert.equal(first.done.status, 302);
    const none = await tokenFor(worker, first.done.headers.get('location')!, first.clientId, first.verifier);
    const person = (await (await identities.get('email:ada@example.com').fetch('https://object/person', { method: 'POST', body: '[]' })).json() as { result: string }).result;
    assert.deepEqual((await worker.validateToken(AUDIENCE, none))!.props, { person, customer: null });
    assert.deepEqual(await worker.customers(person), []);
    // The address the code proved is what activation without a checkout is decided by (CUS-03).
    assert.equal(await worker.email(person), 'ada@example.com');

    // The lifecycle makes acme for them at checkout, through the content server.
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
  } finally {
    net.restore();
  }
});

test('a code is mailed from the issuer outside every unsubscribe group, and the page reads alike for any address', async () => {
  const { worker, identities, addCustomer } = setup();
  const net = outside();
  try {
    const known = await emailSignIn(worker, 'ada@example.com', net.mail);
    const person = (await (await identities.get('email:ada@example.com').fetch('https://object/person', { method: 'POST', body: '[]' })).json() as { result: string }).result;
    await addCustomer(person, 'acme');
    const again = await emailSignIn(worker, 'ada@example.com', net.mail);
    const unknown = await emailSignIn(worker, 'nobody@example.com', net.mail);
    const strip = (html: string) => html.replace(/state=[^"]+"/, '').replace(/ada@example\.com|nobody@example\.com/g, 'ADDRESS');
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

test('a wrong code asks again, and the fifth wrong one locks the code', async () => {
  const { worker } = setup();
  const net = outside();
  try {
    const { body: client } = await register(worker, [CLAUDE]);
    const go = browser(worker);
    const signIn = await (await go(await authorizeUrl(client.client_id!, CLAUDE, 'v'.repeat(64)))).text();
    let html = await (await go('/authorize', { form: { handle: hidden(signIn, 'handle'), way: 'email', address: 'ada@example.com' } })).text();
    const code = net.mail.at(-1).subject.slice(0, 6);
    const wrong = code === '000000' ? '111111' : '000000';
    for (let i = 1; i < 5; i++) {
      const response = await go(`/code?state=${encodeURIComponent(stateIn(html))}`, { form: { code: wrong } });
      html = await response.text();
      assert.match(html, /doesn&#39;t match|doesn't match/);
    }
    const locked = await go(`/code?state=${encodeURIComponent(stateIn(html))}`, { form: { code: wrong } });
    assert.match(await locked.text(), /expired or was tried too many times/);
  } finally {
    net.restore();
  }
});

test('codes sent from one network are limited', async () => {
  const { worker } = setup();
  const net = outside();
  try {
    const { body: client } = await register(worker, [CLAUDE]);
    let limited = false;
    for (let i = 0; i < 21; i++) {
      const go = browser(worker);
      const signIn = await (await go(await authorizeUrl(client.client_id!, CLAUDE, 'v'.repeat(64)))).text();
      const html = await (await go('/authorize', { form: { handle: hidden(signIn, 'handle'), way: 'email', address: `person${i}@example.com` } })).text();
      if (/Too many codes/.test(html)) limited = true;
    }
    assert.equal(net.mail.length, 20);
    assert.ok(limited);
  } finally {
    net.restore();
  }
});

test('a client naming any redirect but Claude\'s callback or a loopback address is refused', async () => {
  const { worker } = setup();
  assert.equal((await register(worker, [CLAUDE])).status, 201);
  assert.equal((await register(worker, ['http://localhost:4567/callback'])).status, 201);
  assert.equal((await register(worker, ['http://127.0.0.1:4567/callback'])).status, 201);
  assert.equal((await register(worker, ['https://evil.example/callback'])).status, 400);
  assert.equal((await register(worker, [CLAUDE, 'https://evil.example/callback'])).status, 400);
  assert.equal((await register(worker, ['http://evil.example/callback'])).status, 400);
});

test('a client registered any other way is refused at sign-in if any redirect it names is not allowed', async () => {
  const { worker, env } = setup();
  const oauth = authorizationServer(env).getOAuthApi(env);
  const mixed = await oauth.createClient({ clientName: 'Mixed', redirectUris: [CLAUDE, 'https://evil.example/callback'], tokenEndpointAuthMethod: 'none' });
  const page = await browser(worker)(await authorizeUrl(mixed.clientId, CLAUDE, 'v'.repeat(64)));
  assert.equal(page.status, 400);
  assert.match(await page.text(), /does not allow/);
});

test('Google, GitHub and Meta are offered only when configured, and ask for identity alone', async () => {
  const bare = setup({ SENDGRID_API_KEY: undefined });
  const { body: c1 } = await register(bare.worker, [CLAUDE]);
  const page = await (await browser(bare.worker)(await authorizeUrl(c1.client_id!, CLAUDE, 'v'.repeat(64)))).text();
  assert.doesNotMatch(page, /Continue with|Email me a code/);

  const { worker } = setup({ GOOGLE_CLIENT_ID: 'g-id', GOOGLE_CLIENT_SECRET: 'g-secret', GITHUB_CLIENT_ID: 'h-id', GITHUB_CLIENT_SECRET: 'h-secret', META_APP_ID: 'm-id', META_APP_SECRET: 'm-secret' });
  const { body: client } = await register(worker, [CLAUDE]);
  const scopes: Record<string, string> = {};
  for (const way of ['google', 'github', 'meta']) {
    const go = browser(worker);
    const signIn = await (await go(await authorizeUrl(client.client_id!, CLAUDE, 'v'.repeat(64)))).text();
    const response = await go('/authorize', { form: { handle: hidden(signIn, 'handle'), way } });
    assert.equal(response.status, 302);
    const location = new URL(response.headers.get('location')!);
    assert.equal(location.searchParams.get('redirect_uri'), `${ISSUER}/callback`);
    assert.ok(location.searchParams.get('state'));
    scopes[location.origin] = location.searchParams.get('scope')!;
    if (way !== 'meta') assert.equal(location.searchParams.get('code_challenge_method'), 'S256');
  }
  assert.deepEqual(scopes, {
    'https://accounts.google.com': 'openid email profile',
    'https://github.com': 'read:user user:email',
    'https://www.facebook.com': 'public_profile,email',
  });
});

test('signing in with Google and with an email code at the same address makes two accounts, not one', async () => {
  const { worker, identities } = setup({ GOOGLE_CLIENT_ID: 'g-id', GOOGLE_CLIENT_SECRET: 'g-secret' });
  const net = outside({
    'https://oauth2.googleapis.com/token': { access_token: 'google-access' },
    'https://openidconnect.googleapis.com/v1/userinfo': { sub: 'g-123', email: 'ada@example.com', email_verified: true },
  });
  try {
    await emailSignIn(worker, 'ada@example.com', net.mail);
    const { body: client } = await register(worker, [CLAUDE]);
    const go = browser(worker);
    const signIn = await (await go(await authorizeUrl(client.client_id!, CLAUDE, 'v'.repeat(64)))).text();
    const away = await go('/authorize', { form: { handle: hidden(signIn, 'handle'), way: 'google' } });
    const state = new URL(away.headers.get('location')!).searchParams.get('state')!;
    const back = await go(`/callback?${new URLSearchParams({ state, code: 'google-code' })}`);
    assert.equal(back.status, 302);
    const exchange = net.calls.find((c) => c.url === 'https://oauth2.googleapis.com/token')!;
    const sent = new URLSearchParams(String(exchange.init!.body));
    assert.equal(sent.get('code'), 'google-code');
    assert.ok(sent.get('code_verifier'));

    const person = async (name: string) => (await (await identities.get(name).fetch('https://object/person', { method: 'POST', body: '[]' })).json() as { result: string }).result;
    const byEmail = await person('email:ada@example.com');
    const byGoogle = await person('google:g-123');
    assert.ok(byEmail && byGoogle);
    assert.notEqual(byEmail, byGoogle);
  } finally {
    net.restore();
  }
});

test('a provider that sends the person back with an error tells Claude they declined', async () => {
  const { worker } = setup({ GITHUB_CLIENT_ID: 'h-id', GITHUB_CLIENT_SECRET: 'h-secret' });
  const { body: client } = await register(worker, [CLAUDE]);
  const go = browser(worker);
  const signIn = await (await go(await authorizeUrl(client.client_id!, CLAUDE, 'v'.repeat(64)))).text();
  const away = await go('/authorize', { form: { handle: hidden(signIn, 'handle'), way: 'github' } });
  const state = new URL(away.headers.get('location')!).searchParams.get('state')!;
  const back = await go(`/callback?${new URLSearchParams({ state, error: 'access_denied' })}`);
  const location = new URL(back.headers.get('location')!);
  assert.equal(location.searchParams.get('error'), 'access_denied');
  assert.equal(location.searchParams.get('state'), 'claude-state');
});

test('a person with two customers chooses which one this connection serves', async () => {
  const { worker, identities, addCustomer } = setup();
  const net = outside();
  try {
    await emailSignIn(worker, 'ada@example.com', net.mail);
    const person = (await (await identities.get('email:ada@example.com').fetch('https://object/person', { method: 'POST', body: '[]' })).json() as { result: string }).result;
    await addCustomer(person, 'acme');
    await addCustomer(person, 'globex', 'Globex');
    const { done, go } = await emailSignIn(worker, 'ada@example.com', net.mail);
    const chooser = await done.text();
    // Each brand is shown by the name the person gave it; one never named says so.
    assert.match(chooser, /value="acme"[^>]*> Unnamed brand</);
    assert.match(chooser, /value="globex"[^>]*> Globex</);

    const forged = await go(`/choose?state=${encodeURIComponent(stateIn(chooser))}`, { form: { customer: 'initech' } });
    assert.equal(forged.status, 400);

    const again = await emailSignIn(worker, 'ada@example.com', net.mail);
    const chosen = await again.go(`/choose?state=${encodeURIComponent(stateIn(await again.done.text()))}`, { form: { customer: 'globex' } });
    assert.equal(chosen.status, 302);
    const token = await tokenFor(worker, chosen.headers.get('location')!, again.clientId, again.verifier);
    assert.deepEqual((await worker.validateToken(AUDIENCE, token))!.props, { person, customer: 'globex' });
  } finally {
    net.restore();
  }
});

test('a sign-in page posted from another browser is refused, and Cancel tells Claude', async () => {
  const { worker } = setup();
  const { body: client } = await register(worker, [CLAUDE]);
  const signIn = await (await browser(worker)(await authorizeUrl(client.client_id!, CLAUDE, 'v'.repeat(64)))).text();
  const elsewhere = await browser(worker)('/authorize', { form: { handle: hidden(signIn, 'handle'), way: 'email', address: 'ada@example.com' } });
  assert.equal(elsewhere.status, 400);

  const go = browser(worker);
  const page = await (await go(await authorizeUrl(client.client_id!, CLAUDE, 'v'.repeat(64)))).text();
  const cancelled = await go('/authorize', { form: { handle: hidden(page, 'handle'), way: 'cancel' } });
  assert.equal(new URL(cancelled.headers.get('location')!).searchParams.get('error'), 'access_denied');
});

test('the sign-in page cannot be framed, and escapes what the client says about itself', async () => {
  const { worker } = setup();
  const response = await worker.fetch(new Request(`${ISSUER}/register`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ client_name: '<script>x</script>', redirect_uris: [CLAUDE], token_endpoint_auth_method: 'none' }),
  }));
  const client = await response.json() as { client_id: string };
  const page = await browser(worker)(await authorizeUrl(client.client_id, CLAUDE, 'v'.repeat(64)));
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

test('while terms are asked for, no way in goes on until the box is ticked, and the grant carries the version ticked', async () => {
  const { worker, identities } = setup({ TERMS_URL: 'https://cmokit.example/beta-terms/', TERMS_VERSION: '2026-11-11' });
  const net = outside();
  try {
    const { body: client } = await register(worker, [CLAUDE]);
    const go = browser(worker);
    const verifier = 'v'.repeat(64);
    const signIn = await (await go(await authorizeUrl(client.client_id!, CLAUDE, verifier))).text();
    assert.match(signIn, /<input type="checkbox" name="terms" value="yes" required>/);
    assert.match(signIn, /href="https:\/\/cmokit\.example\/beta-terms\/"/);
    assert.match(signIn, /version 2026-11-11/);
    assert.match(signIn, /value="cancel" formnovalidate/, 'Cancel needs no tick');

    // Without the tick, nothing is sent and the screen asks again.
    const refused = await go('/authorize', { form: { handle: hidden(signIn, 'handle'), way: 'email', address: 'ada@example.com' } });
    assert.equal(refused.status, 400);
    const again = await refused.text();
    assert.match(again, /Tick the box to accept the beta terms/);
    assert.equal(net.mail.length, 0);

    const codePage = await (await go('/authorize', { form: { handle: hidden(again, 'handle'), way: 'email', address: 'ada@example.com', terms: 'yes' } })).text();
    const done = await go(`/code?state=${encodeURIComponent(stateIn(codePage))}`, { form: { code: net.mail.at(-1).subject.slice(0, 6) } });
    const token = await tokenFor(worker, done.headers.get('location')!, client.client_id!, verifier);
    const person = (await (await identities.get('email:ada@example.com').fetch('https://object/person', { method: 'POST', body: '[]' })).json() as { result: string }).result;
    assert.deepEqual((await worker.validateToken(AUDIENCE, token))!.props, { person, customer: null, terms: '2026-11-11' });
  } finally {
    net.restore();
  }
});

test('without terms, the sign-in screen has no box and the grant names no version', async () => {
  const { worker } = setup();
  const { body: client } = await register(worker, [CLAUDE]);
  const signIn = await (await browser(worker)(await authorizeUrl(client.client_id!, CLAUDE, 'v'.repeat(64)))).text();
  assert.doesNotMatch(signIn, /name="terms"/);
  assert.match(signIn, /keeps only who you are\. It keeps no password/);
});

test('a person with two brands who ticked the terms keeps the version through choosing a brand', async () => {
  const { worker, identities, addCustomer } = setup({ TERMS_URL: 'https://cmokit.example/beta-terms/', TERMS_VERSION: '2026-11-11' });
  const net = outside();
  try {
    await emailSignIn(worker, 'ada@example.com', net.mail, { terms: 'yes' });
    const person = (await (await identities.get('email:ada@example.com').fetch('https://object/person', { method: 'POST', body: '[]' })).json() as { result: string }).result;
    await addCustomer(person, 'acme');
    await addCustomer(person, 'globex');
    const again = await emailSignIn(worker, 'ada@example.com', net.mail, { terms: 'yes' });
    const chosen = await again.go(`/choose?state=${encodeURIComponent(stateIn(await again.done.text()))}`, { form: { customer: 'globex' } });
    const token = await tokenFor(worker, chosen.headers.get('location')!, again.clientId, again.verifier);
    assert.deepEqual((await worker.validateToken(AUDIENCE, token))!.props, { person, customer: 'globex', terms: '2026-11-11' });
  } finally {
    net.restore();
  }
});

const META_APP = { INSTAGRAM_APP_ID: 'ig-app', INSTAGRAM_APP_SECRET: 'ig-secret', INSTAGRAM_CONFIG_ID: 'ig-config' };

/** Signs in with Instagram from Claude's first request, with Meta answering for the given account. */
async function instagramSignIn(worker: any, account: { id: string; username: string }) {
  const net = outside({
    'https://graph.facebook.com/v27.0/oauth/access_token': { access_token: 'ig-access' },
    'https://graph.facebook.com/v27.0/me/assigned_instagram_accounts': { data: [account] },
  });
  try {
    const verifier = 'v'.repeat(64);
    const { body: client } = await register(worker, [CLAUDE]);
    const go = browser(worker);
    const signIn = await (await go(await authorizeUrl(client.client_id!, CLAUDE, verifier))).text();
    const away = await go('/authorize', { form: { handle: hidden(signIn, 'handle'), way: 'instagram' } });
    const location = new URL(away.headers.get('location')!);
    const back = await go(`/callback?${new URLSearchParams({ state: location.searchParams.get('state')!, code: 'ig-code' })}`);
    assert.equal(back.status, 302);
    const token = await tokenFor(worker, back.headers.get('location')!, client.client_id!, verifier);
    return { signIn, location, token, calls: net.calls };
  } finally {
    net.restore();
  }
}

test('Instagram leads the sign-in screen, goes through the Unified Login configuration, and names the person by their Instagram account', async () => {
  const { worker } = setup({ ...META_APP, GITHUB_CLIENT_ID: 'h-id', GITHUB_CLIENT_SECRET: 'h-secret' });
  const first = await instagramSignIn(worker, { id: '17841400000000001', username: 'Ada.Makes' });
  assert.ok(first.signIn.indexOf('value="instagram" class="primary"') < first.signIn.indexOf('value="github"'), 'Instagram is the first, primary button');
  assert.match(first.signIn, /<button name="way" value="github">Continue with GitHub<\/button>/);
  assert.equal(first.location.origin + first.location.pathname, 'https://www.facebook.com/dialog/oauth');
  assert.equal(first.location.searchParams.get('config_id'), 'ig-config');
  assert.equal(first.location.searchParams.get('client_id'), 'ig-app');
  assert.equal(first.location.searchParams.get('redirect_uri'), `${ISSUER}/callback`);
  assert.equal(first.location.searchParams.get('scope'), null, 'the configuration, not a scope list, says what Meta asks for');
  const exchange = new URL(first.calls.find((c) => c.url.startsWith('https://graph.facebook.com/v27.0/oauth/access_token'))!.url);
  assert.equal(exchange.searchParams.get('code'), 'ig-code');

  const { props } = (await worker.validateToken(AUDIENCE, first.token))!;
  assert.deepEqual(await worker.instagram(props.person), { id: '17841400000000001', handle: 'ada.makes' });
  assert.ok(!(await worker.email(props.person)), "Instagram proves no email address");

  // A changed handle is the same person, found by the account's ID, with the handle they have now.
  const again = await instagramSignIn(worker, { id: '17841400000000001', username: 'ada_creates' });
  const later = (await worker.validateToken(AUDIENCE, again.token))!.props;
  assert.equal(later.person, props.person);
  assert.deepEqual(await worker.instagram(props.person), { id: '17841400000000001', handle: 'ada_creates' });
});

test("Google is not offered in Instagram's or Facebook's in-app browser, where it refuses to sign anyone in", async () => {
  const { worker } = setup({ ...META_APP, GOOGLE_CLIENT_ID: 'g-id', GOOGLE_CLIENT_SECRET: 'g-secret' });
  const { body: client } = await register(worker, [CLAUDE]);
  const url = await authorizeUrl(client.client_id!, CLAUDE, 'v'.repeat(64));
  const safari = await (await browser(worker)(url)).text();
  assert.match(safari, /Continue with Google/);
  for (const agent of ['Mozilla/5.0 (iPhone) AppleWebKit/605.1.15 Mobile/15E148 Instagram 312.0.0.0', 'Mozilla/5.0 (iPhone) Mobile/15E148 [FBAN/FBIOS;FBAV/450.0]']) {
    const inApp = await (await browser(worker)(url, { headers: { 'user-agent': agent } })).text();
    assert.doesNotMatch(inApp, /Continue with Google/);
    assert.match(inApp, /Continue with Instagram/);
  }
});
