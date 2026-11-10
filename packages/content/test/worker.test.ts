// The Worker adapter on Node, with a stand-in for the Durable Object namespace, so a call crosses the
// same JSON boundary it crosses on Cloudflare, refusals included.

import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import type { ContentEnv, DurableObjectState } from '../src/worker.ts';
import { KEY } from './fixtures.ts';

// The Worker imports the Workers runtime's entrypoint class; on Node it is a stand-in.
registerHooks({
  resolve(specifier, context, next) {
    if (specifier === 'cloudflare:workers') {
      return { url: 'data:text/javascript,export class WorkerEntrypoint { constructor(ctx, env) { this.ctx = ctx; this.env = env; } }', shortCircuit: true };
    }
    return next(specifier, context);
  },
});

const { activatedEmails, activatedSlug, brandSlug, createContentWorker, issuerTokens, lifecycleBilling, lifecycleWaitlist, waitlistActivated } = await import('../src/worker.ts');

test('the Worker routes each address to its customer\'s object, and refusals come back as tool errors', async () => {
  const { worker, Customer } = createContentWorker({
    tokens: () => ({ check: async (token) => (token === 't' ? { person: 'ada', audience: 'aud' } : undefined) }),
  });
  const objects = new Map<string, InstanceType<typeof Customer>>();
  const env = {
    ISSUER_URL: 'https://auth.example', AUDIENCE: 'aud', CREDENTIAL_KEY: KEY,
    CUSTOMERS: {
      idFromName: (name: string) => name,
      get: (id: unknown) => ({
        fetch: (input: string, init?: RequestInit) => {
          let object = objects.get(id as string);
          if (!object) {
            const db = new DatabaseSync(':memory:');
            const ctx: DurableObjectState = { storage: { sql: { exec: (q, ...p) => ({ toArray: () => db.prepare(q).all(...(p as never[])) as never }) } } };
            object = new Customer(ctx, env);
            objects.set(id as string, object);
            if (id === 'acme') db.prepare('INSERT INTO users (person, added_at) VALUES (?, ?)').run('ada', 0);
          }
          return object.fetch(new Request(input, init));
        },
      }),
    },
  } satisfies ContentEnv;
  const call = async (slug: string, name: string, args: object) => {
    const response = await worker.fetch(new Request(`https://content.example/customers/${slug}/mcp`, {
      method: 'POST', headers: { authorization: 'Bearer t', 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }),
    }), env);
    return response;
  };
  const read = await (await call('acme', 'brand_read', {})).json() as any;
  assert.equal(read.result.structuredContent.version, 0);
  const refused = await (await call('acme', 'brand_change', { approved: false, base_version: 0, reason: 'x', sections: { voice: 'y' } })).json() as any;
  assert.equal(refused.result.isError, true);
  assert.equal((await call('globex', 'brand_read', {})).status, 403);
  assert.deepEqual([...objects.keys()], ['acme', 'globex']);
});

test('issuerTokens checks a token with the issuer for the content server\'s own audience', async () => {
  const asked: [string, string][] = [];
  const env = {
    AUDIENCE: 'https://content.example/mcp',
    ISSUER: {
      async validateToken(resource: string, token: string) {
        asked.push([resource, token]);
        return token === 'good' ? { userId: 'ada', audience: resource, props: { person: 'ada', customer: 'acme' } } : null;
      },
    },
  } as unknown as ContentEnv;
  const tokens = issuerTokens(env);
  assert.deepEqual(await tokens.check('good'), { person: 'ada', audience: 'https://content.example/mcp', customer: 'acme' });
  assert.equal(await tokens.check('bad'), undefined);
  assert.deepEqual(asked, [['https://content.example/mcp', 'good'], ['https://content.example/mcp', 'bad']]);
});

test('the lifecycle\'s entrypoint makes a customer with the person who paid as its user, and sets its access', async () => {
  const { Customer, Access } = createContentWorker({ tokens: () => ({ check: async () => undefined }) });
  const objects = new Map<string, InstanceType<typeof Customer>>();
  const added: string[] = [];
  const env = {
    ISSUER_URL: 'https://auth.example', AUDIENCE: 'aud', CREDENTIAL_KEY: KEY,
    ISSUER: {
      validateToken: async () => null,
      customers: async () => [],
      addCustomer: async (person: string, customer: string) => void added.push(`${person} ${customer}`),
      email: async () => null,
    },
    CUSTOMERS: {
      idFromName: (name: string) => name,
      get: (id: unknown) => ({
        fetch: (input: string, init?: RequestInit) => {
          let object = objects.get(id as string);
          if (!object) {
            const db = new DatabaseSync(':memory:');
            const ctx: DurableObjectState = { storage: { sql: { exec: (q, ...p) => ({ toArray: () => db.prepare(q).all(...(p as never[])) as never }) } } };
            object = new Customer(ctx, env);
            objects.set(id as string, object);
          }
          return object.fetch(new Request(input, init));
        },
      }),
    },
  } satisfies ContentEnv;
  const access = new Access({}, env);
  const ask = async (call: string, ...args: unknown[]) => {
    const response = await env.CUSTOMERS.get('cacme').fetch(`https://customer/${call}`, { method: 'POST', body: JSON.stringify(args) });
    return ((await response.json()) as { result: unknown }).result;
  };
  await access.provision('cacme', 'ada', 'cus_1');
  await access.provision('cacme', 'ada', 'cus_1');
  assert.equal(await ask('isUser', 'ada'), true);
  assert.equal(await ask('isUser', 'bob'), false);
  assert.equal(await ask('billing'), 'cus_1');
  assert.deepEqual(added, ['ada cacme', 'ada cacme']);
  await access.access('cacme', 'lapsed');
  assert.equal(await ask('access'), 'lapsed');
  await assert.rejects(access.provision('../x', 'ada', 'cus_1'));
});

test('lifecycleBilling asks the lifecycle for checkout and portal links', async () => {
  assert.equal(lifecycleBilling({} as ContentEnv), undefined);
  const asked: { url: string; body: unknown }[] = [];
  const billing = lifecycleBilling({
    LIFECYCLE: {
      fetch: async (url: string, init?: RequestInit) => {
        asked.push({ url, body: JSON.parse(String(init!.body)) });
        return Response.json({ url: 'https://pay.example/1' });
      },
    },
  } as unknown as ContentEnv)!;
  assert.equal(await billing.checkout('ada', { successUrl: 'https://c.example/ok', cancelUrl: 'https://c.example/no' }), 'https://pay.example/1');
  assert.equal(await billing.portal('cus_1', 'https://c.example/back'), 'https://pay.example/1');
  assert.deepEqual(asked, [
    { url: 'https://lifecycle.internal/internal/checkout', body: { person: 'ada', successUrl: 'https://c.example/ok', cancelUrl: 'https://c.example/no' } },
    { url: 'https://lifecycle.internal/internal/portal', body: { billing: 'cus_1', returnUrl: 'https://c.example/back' } },
  ]);
});

test('a person whose proven address is activated becomes CMOkit\'s customer at their first call, with one first brand and no checkout', async () => {
  const people: Record<string, { token: string; email: string | null }> = {
    ada: { token: 'ta', email: 'Ada@Example.com' },
    bob: { token: 'tb', email: 'bob@example.com' },
    cy: { token: 'tc', email: null },
    dee: { token: 'td', email: 'Dee@example.com' },
  };
  const { worker, Customer } = createContentWorker({
    tokens: () => ({
      check: async (token) => {
        const person = Object.keys(people).find((p) => people[p].token === token);
        return person ? { person, audience: 'aud' } : undefined;
      },
    }),
  });
  const objects = new Map<string, InstanceType<typeof Customer>>();
  const theirs: Record<string, string[]> = {};
  const env = {
    ISSUER_URL: 'https://auth.example', AUDIENCE: 'aud', CREDENTIAL_KEY: KEY,
    ACTIVATED_EMAILS: ' ada@example.com,  someone@example.com ',
    // The site's waitlist, where a maintainer activated Dee.
    LIFECYCLE: {
      fetch: async (input: string, init?: RequestInit) => {
        assert.equal(input, 'https://lifecycle.internal/internal/activated');
        const { email } = JSON.parse(String(init?.body)) as { email: string };
        return Response.json({ activated: email.toLowerCase() === 'dee@example.com' });
      },
    },
    ISSUER: {
      validateToken: async () => null,
      customers: async (person: string) => theirs[person] ?? [],
      addCustomer: async (person: string, customer: string) => {
        theirs[person] = [...new Set([...(theirs[person] ?? []), customer])];
      },
      email: async (person: string) => people[person]?.email ?? null,
    },
    CUSTOMERS: {
      idFromName: (name: string) => name,
      get: (id: unknown) => ({
        fetch: (input: string, init?: RequestInit) => {
          let object = objects.get(id as string);
          if (!object) {
            const db = new DatabaseSync(':memory:');
            const ctx: DurableObjectState = { storage: { sql: { exec: (q, ...p) => ({ toArray: () => db.prepare(q).all(...(p as never[])) as never }) } } };
            object = new Customer(ctx, env);
            objects.set(id as string, object);
          }
          return object.fetch(new Request(input, init));
        },
      }),
    },
  } satisfies ContentEnv;
  const tools = async (token: string) => {
    const response = await worker.fetch(new Request('https://content.example/mcp', {
      method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    }), env);
    return ((await response.json()) as { result: { tools: { name: string }[] } }).result.tools.map((t) => t.name);
  };

  assert.deepEqual(activatedEmails(env), new Set(['ada@example.com', 'someone@example.com']));
  const slug = await activatedSlug('ada');
  assert.match(slug, /^c[0-9a-f]{15}$/);
  assert.equal(await activatedSlug('ada'), slug);

  // Ada's address is activated, in any case: her first call makes her customer, and every tool is hers.
  assert.ok((await tools('ta')).length > 1);
  assert.deepEqual(theirs.ada, [slug]);
  assert.ok((await tools('ta')).length > 1);
  assert.deepEqual([...objects.keys()], [slug]);

  // Bob's address is not activated, and Cy proved none: each is offered account_status alone.
  assert.deepEqual(await tools('tb'), ['account_status']);
  assert.deepEqual(await tools('tc'), ['account_status']);
  assert.equal(theirs.bob, undefined);
  assert.deepEqual([...objects.keys()], [slug]);

  // Dee was activated on the waitlist, not in ACTIVATED_EMAILS: her first call makes her customer too.
  assert.ok((await tools('td')).length > 1);
  assert.deepEqual(theirs.dee, [await activatedSlug('dee')]);
});

test('waitlistActivated reads the lifecycle\'s answer, and says no when it cannot', async () => {
  const answering = (response: Response) => ({ fetch: async () => response });
  assert.equal(await waitlistActivated(answering(Response.json({ activated: true })), 'a@example.com'), true);
  assert.equal(await waitlistActivated(answering(Response.json({ activated: false })), 'a@example.com'), false);
  assert.equal(await waitlistActivated(answering(new Response(null, { status: 404 })), 'a@example.com'), false);
});

test('lifecycleWaitlist lists the site\'s waitlist and activates people over the binding, for the brand that owns it', async () => {
  assert.equal(lifecycleWaitlist({} as ContentEnv), undefined);
  const asked: { url: string; body: unknown }[] = [];
  const LIFECYCLE = {
    fetch: async (url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init!.body)) as { email?: string };
      asked.push({ url, body });
      if (url.endsWith('/internal/waitlist')) {
        return Response.json({ waitlist: [{ email: 'cy@example.com', joined: '2026-11-09T10:00:00.000Z', code: 'abc', referredBy: null, referrals: 2, activated: null }] });
      }
      if (body.email === 'zed@example.com') return Response.json({ activated: false }, { status: 404 });
      return Response.json({ email: body.email, activated: true, sent: true });
    },
  };
  assert.equal(lifecycleWaitlist({ LIFECYCLE } as unknown as ContentEnv), undefined, 'no owner, no waitlist on the page');
  const waitlist = lifecycleWaitlist({ LIFECYCLE, WAITLIST_CUSTOMER: ' cmokit-1a2b3c ' } as unknown as ContentEnv)!;
  assert.equal(waitlist.owner, 'cmokit-1a2b3c');
  assert.deepEqual(await waitlist.list(), [{ email: 'cy@example.com', joined: '2026-11-09T10:00:00.000Z', referrals: 2, activated: null }]);
  assert.deepEqual(await waitlist.activate('cy@example.com'), { found: true, sent: true });
  assert.deepEqual(await waitlist.activate('zed@example.com'), { found: false, sent: false });
  assert.deepEqual(asked.map((a) => a.url), [
    'https://lifecycle.internal/internal/waitlist', 'https://lifecycle.internal/internal/activate', 'https://lifecycle.internal/internal/activate',
  ]);
});

test('a new brand\'s slug comes from its name, with a random end, and is always a valid slug', () => {
  assert.match(brandSlug('CFO Kit'), /^cfo-kit-[0-9a-f]{6}$/);
  assert.match(brandSlug('Café & Co.'), /^cafe-co-[0-9a-f]{6}$/);
  assert.match(brandSlug('東京'), /^brand-[0-9a-f]{6}$/);
  assert.notEqual(brandSlug('CFO Kit'), brandSlug('CFO Kit'));
  assert.match(brandSlug('a'.repeat(60)), /^[a-z0-9][a-z0-9-]{0,62}$/);
});
