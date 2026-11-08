// The Worker adapter on Node, with a stand-in for the Durable Object namespace, so a call crosses the
// same JSON boundary it crosses on Cloudflare, refusals included.

import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { createContentWorker, type ContentEnv, type DurableObjectState } from '../src/worker.ts';
import { KEY } from './fixtures.ts';

test('the Worker routes each call to the signed-in person\'s customer object, and refusals come back as tool errors', async () => {
  const { worker, Customer } = createContentWorker({
    accounts: () => ({
      check: async (token) => (token === 't' ? { person: 'ada', audience: 'aud' } : undefined),
      customersOf: async () => ['acme', 'globex'],
    }),
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
  const call = async (customer: string, name: string, args: object) => {
    const response = await worker.fetch(new Request('https://content.example/mcp', {
      method: 'POST', headers: { authorization: 'Bearer t', 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: { ...args, customer } } }),
    }), env);
    return response;
  };
  const read = await (await call('acme', 'brand_read', {})).json() as any;
  assert.equal(read.result.structuredContent.version, 0);
  const refused = await (await call('acme', 'brand_change', { approved: false, base_version: 0, reason: 'x', sections: { voice: 'y' } })).json() as any;
  assert.equal(refused.result.isError, true);
  const stale = await (await call('globex', 'brand_read', {})).json() as any;
  assert.equal(stale.result.isError, true, 'the customer object, not the index, decides who its users are');
  assert.deepEqual([...objects.keys()], ['acme', 'globex']);
});
