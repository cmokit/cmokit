// The Cloudflare Worker adapter. A site's lifecycle Worker is:
//
//   const { worker, Lead } = createLifecycleWorker(config, messages);
//   export { Lead };
//   export default worker;
//
// with the site's CMOkit configuration and its message templates bundled into it at deploy
// (ADR-0008), and `Lead` bound as the Durable Object class LEADS. The site's waitlist is one more
// object of that class, named `waitlist`, so a waitlist needs no binding of its own (ADR-0014). It has
// no route of its own: the edge reaches it through a service binding, and so does a product's Worker
// that asks it for checkout and portal links or whether an address is activated. It reaches the
// product through a service binding named PRODUCT (ADR-0017). The only host-specific code in the
// lifecycle lives here.

import { defineConfig, resolve, type Config, type Resolved } from '@cmokit/cli';
import { WAITLIST, createLifecycle, type Leads, type Messaging, type WaitlistCalls } from './index.ts';
import { Lead as LeadLogic, type Capture } from './lead.ts';
import { Waitlist as WaitlistLogic, type Joining } from './waitlist.ts';
import { parse } from './render.ts';
import { posthog } from './posthog.ts';
import { sendgrid } from './sendgrid.ts';
import { stripe } from './stripe.ts';
import { createSubscriptions, type Product } from './subscriptions.ts';
import type { Sql } from './sql.ts';

export interface LifecycleEnv {
  LEADS: DurableObjectNamespace;
  /** A SendGrid API key with Mail Send and Suppressions access. A secret. */
  SENDGRID_API_KEY?: string;
  /** SendGrid's signed event webhook verification key. Public. */
  SENDGRID_WEBHOOK_KEY?: string;
  /** A Stripe key that can write Checkout Sessions and portal sessions and read subscriptions. A secret. */
  STRIPE_SECRET_KEY?: string;
  /** The Stripe webhook endpoint's signing secret. A secret. */
  STRIPE_WEBHOOK_SECRET?: string;
  /** The product's Worker, whose API gives and revokes a customer's access. */
  PRODUCT?: Product;
  /** The key a maintainer's `cmokit waitlist` requests carry. A secret. */
  WAITLIST_KEY?: string;
}

export interface DurableObjectNamespace {
  idFromName(name: string): unknown;
  get(id: unknown): { fetch(input: string, init?: RequestInit): Promise<Response> };
}

export interface DurableObjectState {
  storage: {
    sql: { exec(query: string, ...params: unknown[]): { toArray(): Record<string, string | number | null>[] } };
    setAlarm(at: number): Promise<void>;
    deleteAlarm(): Promise<void>;
  };
}

/** The Durable Object class a lead lives in, which the site's Worker exports as `Lead`. */
export interface LeadClass {
  new (ctx: DurableObjectState, env: LifecycleEnv): { fetch(request: Request): Promise<Response>; alarm(): Promise<void> };
}

export interface LifecycleWorker {
  worker: { fetch(request: Request, env: LifecycleEnv): Promise<Response> };
  Lead: LeadClass;
}

/** Checks that every message the configuration names has a template with a subject. */
export function templateProblems(config: Resolved, templates: Record<string, string>): string[] {
  const found: string[] = [];
  for (const sequence of config.sequences) {
    for (const { template } of sequence.messages) {
      const text = templates[template];
      if (text === undefined) found.push(`sequence "${sequence.name}": no template messages/${template}.md`);
      else {
        const parsed = parse(text);
        if ('problem' in parsed) found.push(`messages/${template}.md ${parsed.problem}`);
      }
    }
  }
  const waitlist = config.waitlist?.template;
  if (waitlist !== undefined) {
    const text = templates[waitlist];
    if (text === undefined) found.push(`waitlist: no template messages/${waitlist}.md`);
    else if ('problem' in parse(text)) found.push(`messages/${waitlist}.md ${(parse(text) as { problem: string }).problem}`);
  }
  return found;
}

export function createLifecycleWorker(config: Config, templates: Record<string, string>): LifecycleWorker {
  const resolved = resolve(defineConfig(config));
  const problems = templateProblems(resolved, templates);
  if (problems.length > 0) throw new Error(`CMOkit messages:\n  ${problems.join('\n  ')}`);
  const analytics = posthog({ key: resolved.analytics.posthog.key, host: resolved.analytics.posthog.host });

  const messagingFor = (env: LifecycleEnv): Messaging => {
    if (env.SENDGRID_API_KEY) return sendgrid({ key: env.SENDGRID_API_KEY, webhookKey: env.SENDGRID_WEBHOOK_KEY });
    const missing = async () => { throw new Error('SENDGRID_API_KEY is not set'); };
    return { send: missing, suppress: missing, reports: async () => undefined };
  };

  class Lead {
    readonly #ctx: DurableObjectState;
    readonly #sql: Sql;
    readonly #lead: LeadLogic;

    constructor(ctx: DurableObjectState, env: LifecycleEnv) {
      this.#ctx = ctx;
      this.#sql = { all: (query, ...params) => ctx.storage.sql.exec(query, ...params).toArray() };
      this.#lead = new LeadLogic(this.#sql, { config: resolved, templates, messaging: messagingFor(env), analytics });
    }

    async fetch(request: Request): Promise<Response> {
      const action = new URL(request.url).pathname;
      const body = await request.json() as Record<string, string>;
      if (action.startsWith(`/${WAITLIST}/`)) return this.#waitlist(action.slice(WAITLIST.length + 1), body);
      if (action === '/start') {
        const at = await this.#lead.start(body as unknown as Capture, Date.now());
        if (at !== null) await this.#ctx.storage.setAlarm(at);
        return Response.json({});
      }
      if (action === '/stop') {
        await this.#lead.stop(body.reason, body.eventId);
        if (this.#lead.held()?.state !== 'active') await this.#ctx.storage.deleteAlarm();
        return Response.json({});
      }
      if (action === '/unsubscribe') {
        const email = await this.#lead.unsubscribe(body.token);
        if (email !== undefined) await this.#ctx.storage.deleteAlarm();
        return Response.json(email === undefined ? { valid: false } : { valid: true, email });
      }
      return new Response(null, { status: 404 });
    }

    async alarm(): Promise<void> {
      const at = await this.#lead.wake(Date.now());
      if (at !== null) await this.#ctx.storage.setAlarm(at);
    }

    // The waitlist's object holds no lead, and a lead's object no waitlist.
    async #waitlist(action: string, body: Record<string, string>): Promise<Response> {
      const list = new WaitlistLogic(this.#sql);
      if (action === '/join') {
        await list.join(body as unknown as Joining, Date.now());
        return Response.json({});
      }
      if (action === '/list') return Response.json(list.list());
      if (action === '/activate') return Response.json({ found: list.has(body.email), activated: list.activate(body.email, Date.now()) });
      if (action === '/activated') return Response.json(list.isActivated(body.email));
      if (action === '/unsubscribe') return Response.json({ email: list.unsubscribe(body.key, body.token) ?? null });
      return new Response(null, { status: 404 });
    }
  }

  const leadsFor = (env: LifecycleEnv): Leads => {
    const call = async (sequence: string, key: string, action: string, body: object) => {
      const stub = env.LEADS.get(env.LEADS.idFromName(`${sequence}:${key}`));
      const response = await stub.fetch(`https://lead${action}`, { method: 'POST', body: JSON.stringify(body) });
      return response.json() as Promise<{ valid?: boolean; email?: string | null }>;
    };
    return {
      async start(capture) {
        await call(capture.sequence, capture.key, '/start', capture);
      },
      async stop(sequence, key, reason, eventId) {
        await call(sequence, key, '/stop', { reason, ...(eventId ? { eventId } : {}) });
      },
      async unsubscribe(sequence, key, token) {
        const answer = await call(sequence, key, '/unsubscribe', { token });
        return answer.valid ? answer.email ?? null : undefined;
      },
    };
  };

  const waitlistFor = (env: LifecycleEnv): WaitlistCalls => {
    const call = async <T>(action: string, body: object): Promise<T> => {
      const stub = env.LEADS.get(env.LEADS.idFromName(WAITLIST));
      const response = await stub.fetch(`https://lead/${WAITLIST}${action}`, { method: 'POST', body: JSON.stringify(body) });
      return response.json() as Promise<T>;
    };
    return {
      join: async (joining) => void await call('/join', joining),
      list: () => call('/list', {}),
      activate: async (email) => {
        const answer = await call<{ found: boolean; activated?: ReturnType<WaitlistLogic['activate']> }>('/activate', { email });
        return { found: answer.found, ...(answer.activated ? { activated: answer.activated } : {}) };
      },
      isActivated: (email) => call('/activated', { email }),
      unsubscribe: async (key, token) => (await call<{ email: string | null }>('/unsubscribe', { key, token })).email ?? undefined,
    };
  };

  const worker = {
    async fetch(request: Request, env: LifecycleEnv): Promise<Response> {
      const subscriptions = resolved.subscription && env.STRIPE_SECRET_KEY && env.PRODUCT
        ? createSubscriptions({ config: resolved, payments: stripe({ key: env.STRIPE_SECRET_KEY, webhookSecret: env.STRIPE_WEBHOOK_SECRET }), product: env.PRODUCT })
        : undefined;
      // Without a key no message can be sent, so no lead is captured into a sequence it would fail.
      const handle = createLifecycle({
        config: resolved, leads: leadsFor(env), messaging: messagingFor(env), analytics, subscriptions, templates,
        sending: Boolean(env.SENDGRID_API_KEY),
        ...(resolved.waitlist ? { waitlist: waitlistFor(env), ...(env.WAITLIST_KEY ? { waitlistKey: env.WAITLIST_KEY } : {}) } : {}),
      });
      return handle(request);
    },
  };

  return { worker, Lead };
}
