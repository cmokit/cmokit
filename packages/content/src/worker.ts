// The Cloudflare Worker adapter. A content server's Worker is:
//
//   const { worker, Customer } = createContentWorker({ accounts: (env) => ... });
//   export { Customer };
//   export default worker;
//
// with `Customer` bound as the Durable Object class CUSTOMERS, one object per customer, named by the
// customer's slug (ADR-0030). Every variable and secret it reads is in the deployment reference. How
// tokens are checked, and which customers a person is a user of, are passed in: the adapter for
// CMOkit's own issuer (ADR-0018, ADR-0029) comes with the issuer. The only host-specific code in the content server lives here.

import { Customer as CustomerLogic, Refusal } from './customer.ts';
import { createContentServer, type Accounts, type CustomerPages } from './index.ts';
import { luma } from './luma.ts';
import type { Sql } from './sql.ts';
import type { CustomerCalls } from './tools.ts';
import { aesGcmVault } from './vault.ts';

export interface ContentEnv {
  CUSTOMERS: DurableObjectNamespace;
  /** The issuer's address. A variable. */
  ISSUER_URL: string;
  /** The audience the issuer issues the content server's tokens for. A variable. */
  AUDIENCE: string;
  /** 32 random bytes as base64, which seal each customer's credentials. A secret. */
  CREDENTIAL_KEY: string;
}

export interface DurableObjectNamespace {
  idFromName(name: string): unknown;
  get(id: unknown): { fetch(input: string, init?: RequestInit): Promise<Response> };
}

export interface DurableObjectState {
  storage: { sql: { exec(query: string, ...params: unknown[]): { toArray(): Record<string, string | number | null>[] } } };
}

export interface CustomerClass {
  new (ctx: DurableObjectState, env: ContentEnv): { fetch(request: Request): Promise<Response> };
}

/** The calls the Worker may make on a customer's object. */
const CALLS = ['status', 'brandRead', 'brandHistory', 'brandChange', 'offersList', 'pieceSave', 'piecesList', 'resultsRead', 'isUser', 'linkFor', 'connect'] as const;
type Call = (typeof CALLS)[number];

export function createContentWorker(options: { accounts(env: ContentEnv): Accounts }) {
  class Customer {
    readonly #logic: CustomerLogic;

    constructor(ctx: DurableObjectState, env: ContentEnv) {
      const sql: Sql = { all: (query, ...params) => ctx.storage.sql.exec(query, ...params).toArray() };
      this.#logic = new CustomerLogic(sql, { vault: aesGcmVault(env.CREDENTIAL_KEY), events: luma() });
    }

    async fetch(request: Request): Promise<Response> {
      const call = new URL(request.url).pathname.slice(1) as Call;
      if (!CALLS.includes(call)) return new Response(null, { status: 404 });
      const args = await request.json() as unknown[];
      try {
        const result = await (this.#logic[call] as (...a: unknown[]) => Promise<unknown>)(...args);
        return Response.json({ result: result ?? null });
      } catch (error) {
        if (error instanceof Refusal) return Response.json({ refusal: error.message }, { status: 422 });
        throw error;
      }
    }
  }

  const customerFor = (env: ContentEnv, slug: string): CustomerCalls & CustomerPages => {
    const stub = env.CUSTOMERS.get(env.CUSTOMERS.idFromName(slug));
    const call = async (name: Call, ...args: unknown[]) => {
      const response = await stub.fetch(`https://customer/${name}`, { method: 'POST', body: JSON.stringify(args) });
      const body = await response.json() as { result?: unknown; refusal?: string };
      if (body.refusal !== undefined) throw new Refusal(body.refusal);
      return body.result;
    };
    return Object.fromEntries(CALLS.map((name) => [name, (...args: unknown[]) => call(name, ...args)])) as unknown as CustomerCalls & CustomerPages;
  };

  const worker = {
    async fetch(request: Request, env: ContentEnv): Promise<Response> {
      const handle = createContentServer({
        issuer: env.ISSUER_URL,
        audience: env.AUDIENCE,
        accounts: options.accounts(env),
        customer: (slug) => customerFor(env, slug),
      });
      return handle(request);
    },
  };

  return { worker, Customer: Customer as CustomerClass };
}
