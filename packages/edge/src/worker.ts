// The Cloudflare Worker adapter. A site's Worker is `export default createWorker()`, routed in front of
// the site's own domain. The only host-specific code in the edge lives here.

import { MANIFEST_PATH, type Manifest } from '@cmokit/cli';
import { createEdge } from './index.ts';
import { posthog } from './posthog.ts';

export interface WorkerEnv {
  /**
   * Where the static site is fetched from. Leave unset when the Worker is routed on the site's own
   * domain, where a Worker's fetch to that domain reaches the origin rather than the Worker again.
   */
  CMOKIT_ORIGIN?: string;
}

interface ExecutionContext {
  waitUntil(work: Promise<unknown>): void;
}

export interface WorkerOptions {
  /** How long a fetched manifest is reused, in milliseconds. */
  manifestTtlMs?: number;
}

export function createWorker(options: WorkerOptions = {}) {
  const ttl = options.manifestTtlMs ?? 60_000;
  let cached: { manifest: Manifest | undefined; until: number; origin: string } | undefined;

  const toOrigin = (request: Request, env: WorkerEnv): Request => {
    if (!env.CMOKIT_ORIGIN) return request;
    const url = new URL(request.url);
    const origin = new URL(env.CMOKIT_ORIGIN);
    const target = new URL(origin.pathname.replace(/\/+$/, '') + url.pathname + url.search, origin);
    return new Request(target, request);
  };

  return {
    async fetch(request: Request, env: WorkerEnv, ctx: ExecutionContext): Promise<Response> {
      const origin = (r: Request) => fetch(toOrigin(r, env));
      const site = new URL(request.url).origin;

      const manifest = async (): Promise<Manifest | undefined> => {
        if (cached && cached.origin === site && cached.until > Date.now()) return cached.manifest;
        let found: Manifest | undefined;
        try {
          const response = await origin(new Request(new URL(MANIFEST_PATH, request.url)));
          if (response.ok) {
            const body = (await response.json()) as Manifest;
            if (body.version === 1) found = body;
          }
        } catch {
          found = undefined;
        }
        cached = { manifest: found, until: Date.now() + ttl, origin: site };
        return found;
      };

      const handle = createEdge({
        manifest,
        origin,
        tools: (m) => posthog({ key: m.analytics.posthog.key, host: m.analytics.posthog.host }),
        background: (work) => ctx.waitUntil(work),
      });
      return handle(request);
    },
  };
}
