// PostHog behind the experiments and analytics interfaces (ADR-0010). Uses only PostHog's public HTTP
// API with the project key, which is public by design.

import type { Analytics, Experiments, Tools } from './index.ts';

export interface PostHogOptions {
  key: string;
  host: string;
  fetch?: typeof fetch;
  /** How long a flag evaluation may take before the visitor is served the control. */
  timeoutMs?: number;
}

interface FlagsResponse {
  flags?: Record<string, { enabled?: boolean; variant?: string | null }>;
}

export function posthog(options: PostHogOptions): Tools {
  const send = options.fetch ?? fetch;
  const host = options.host.replace(/\/+$/, '');
  const timeout = options.timeoutMs ?? 1500;

  const experiments: Experiments = {
    async variantFor(visitor, flag) {
      const response = await send(`${host}/flags?v=2`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ api_key: options.key, distinct_id: visitor }),
        signal: AbortSignal.timeout(timeout),
      });
      if (!response.ok) return undefined;
      const result = (await response.json()) as FlagsResponse;
      const answer = result.flags?.[flag];
      return answer?.enabled && typeof answer.variant === 'string' ? answer.variant : undefined;
    },
  };

  const analytics: Analytics = {
    async capture(event) {
      await send(`${host}/i/v0/e/`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          api_key: options.key,
          event: event.name,
          distinct_id: event.visitor ?? crypto.randomUUID(),
          properties: event.properties,
          timestamp: new Date().toISOString(),
        }),
      });
    },

    async relay(request, path) {
      // PostHog serves its browser scripts from an assets host beside the ingestion host.
      const base = path.startsWith('/static/') ? assetsHost(host) : host;
      const target = new URL(base + path + new URL(request.url).search);
      const headers = new Headers(request.headers);
      for (const name of ['cookie', 'host', 'origin', 'referer']) headers.delete(name);
      const address = request.headers.get('cf-connecting-ip') ?? request.headers.get('x-real-ip');
      if (address) headers.set('x-forwarded-for', address);
      const hasBody = request.method !== 'GET' && request.method !== 'HEAD';
      const response = await send(target, {
        method: request.method,
        headers,
        body: hasBody ? await request.arrayBuffer() : undefined,
      });
      const out = new Response(response.body, response);
      out.headers.delete('set-cookie');
      return out;
    },
  };

  return { experiments, analytics };
}

function assetsHost(host: string): string {
  const url = new URL(host);
  const [region, ...rest] = url.hostname.split('.');
  if (rest[0] === 'i') url.hostname = [`${region}-assets`, ...rest].join('.');
  return url.origin;
}
