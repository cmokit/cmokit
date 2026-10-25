// The Cloudflare Worker adapter. A site's Worker is `export default createWorker(config)`, with the
// site's CMOkit configuration bundled into it at deploy (ADR-0008), routed in front of the site's own
// domain. The only host-specific code in the edge lives here.

import { defineConfig, resolve, type Config } from '@cmokit/cli';
import { createEdge } from './index.ts';
import { posthog } from './posthog.ts';

export interface WorkerEnv {
  /**
   * Where the site is fetched from. Leave unset when the Worker is routed on the site's own domain,
   * where a Worker's fetch to that domain reaches the origin rather than the Worker again.
   */
  CMOKIT_ORIGIN?: string;
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
        tools,
        background: (work) => ctx.waitUntil(work),
      });
      return handle(request);
    },
  };
}
