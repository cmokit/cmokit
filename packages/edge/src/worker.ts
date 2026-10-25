// The Cloudflare Worker adapter. A site's Worker is `export default createWorker(config)`, with the
// site's CMOkit configuration bundled into it at deploy (ADR-0008), routed in front of the site's own
// domain. The only host-specific code in the edge lives here.

import { LIFECYCLE_EVENT, LIFECYCLE_LEAD, defineConfig, resolve, type Config } from '@cmokit/cli';
import { createEdge, type Lifecycle } from './index.ts';
import { posthog } from './posthog.ts';

export interface WorkerEnv {
  /**
   * Where the site is fetched from. Leave unset when the Worker is routed on the site's own domain,
   * where a Worker's fetch to that domain reaches the origin rather than the Worker again.
   */
  CMOKIT_ORIGIN?: string;
  /** The service binding to the site's lifecycle Worker, when the site sends messages to leads. */
  LIFECYCLE?: { fetch(input: Request | string, init?: RequestInit): Promise<Response> };
}

// The lifecycle Worker has no route; it is reached only through this binding, at any address.
const LIFECYCLE_ORIGIN = 'https://lifecycle.internal';

function lifecycleOf(binding: NonNullable<WorkerEnv['LIFECYCLE']>): Lifecycle {
  const post = async (path: string, body: unknown) => {
    const response = await binding.fetch(`${LIFECYCLE_ORIGIN}${path}`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error(`the lifecycle answered ${response.status}`);
  };
  return {
    capture: (lead) => post(LIFECYCLE_LEAD, lead),
    event: (key, event) => post(LIFECYCLE_EVENT, { key, event }),
    forward: (request) => binding.fetch(request),
  };
}

interface ExecutionContext {
  waitUntil(work: Promise<unknown>): void;
}

export function createWorker(config: Config) {
  const resolved = resolve(defineConfig(config));
  const tools = posthog({ key: resolved.analytics.posthog.key, host: resolved.analytics.posthog.host });

  const toOrigin = (request: Request, env: WorkerEnv): Request => {
    if (!env.CMOKIT_ORIGIN) return request;
    const url = new URL(request.url);
    const origin = new URL(env.CMOKIT_ORIGIN);
    const target = new URL(origin.pathname.replace(/\/+$/, '') + url.pathname + url.search, origin);
    return new Request(target, request);
  };

  return {
    async fetch(request: Request, env: WorkerEnv, ctx: ExecutionContext): Promise<Response> {
      const handle = createEdge({
        config: resolved,
        origin: (r) => fetch(toOrigin(r, env)),
        tools: env.LIFECYCLE ? { ...tools, lifecycle: lifecycleOf(env.LIFECYCLE) } : tools,
        background: (work) => ctx.waitUntil(work),
      });
      return handle(request);
    },
  };
}
