// The Cloudflare Worker adapter. A site's lifecycle Worker is:
//
//   const { worker, Lead } = createLifecycleWorker(config, messages);
//   export { Lead };
//   export default worker;
//
// with the site's CMOkit configuration and its message templates bundled into it at deploy
// (ADR-0008), and `Lead` bound as the Durable Object class LEADS. It has no route of its own: the
// edge reaches it through a service binding. The only host-specific code in the lifecycle lives here.

import { LIFECYCLE_LEAD, defineConfig, resolve, type Config, type Resolved } from '@cmokit/cli';
import { createLifecycle, type Leads, type Messaging } from './index.ts';
import { Lead as LeadLogic, type Capture } from './lead.ts';
import { parse } from './render.ts';
import { posthog } from './posthog.ts';
import { sendgrid } from './sendgrid.ts';
import type { Sql } from './sql.ts';

export interface LifecycleEnv {
  LEADS: DurableObjectNamespace;
  /** A SendGrid API key with Mail Send and Suppressions access. A secret. */
  SENDGRID_API_KEY?: string;
  /** SendGrid's signed event webhook verification key. Public. */
  SENDGRID_WEBHOOK_KEY?: string;
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
    readonly #lead: LeadLogic;

    constructor(ctx: DurableObjectState, env: LifecycleEnv) {
      this.#ctx = ctx;
      const sql: Sql = { all: (query, ...params) => ctx.storage.sql.exec(query, ...params).toArray() };
      this.#lead = new LeadLogic(sql, { config: resolved, templates, messaging: messagingFor(env), analytics });
    }

    async fetch(request: Request): Promise<Response> {
      const action = new URL(request.url).pathname;
      const body = await request.json() as Record<string, string>;
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

  const worker = {
    async fetch(request: Request, env: LifecycleEnv): Promise<Response> {
      // Without a key no message could be sent, so no lead is captured into a sequence it would fail.
      if (!env.SENDGRID_API_KEY && new URL(request.url).pathname === LIFECYCLE_LEAD) {
        return new Response('SENDGRID_API_KEY is not set', { status: 503 });
      }
      const handle = createLifecycle({ config: resolved, leads: leadsFor(env), messaging: messagingFor(env), analytics });
      return handle(request);
    },
  };

  return { worker, Lead };
}
