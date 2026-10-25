// PostHog behind the lifecycle's analytics interface (ADR-0010), with the project key, which is
// public by design. An event with an id is sent with a UUID made from it, so PostHog keeps one copy
// of an event its source delivered twice.

import type { Analytics } from './index.ts';

export interface PostHogOptions {
  key: string;
  host: string;
  fetch?: typeof fetch;
}

export function posthog(options: PostHogOptions): Analytics {
  const send = options.fetch ?? fetch;
  const host = options.host.replace(/\/+$/, '');
  return {
    async capture(event) {
      await send(`${host}/i/v0/e/`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          api_key: options.key,
          event: event.name,
          distinct_id: event.visitor,
          properties: event.properties,
          timestamp: new Date(event.at ?? Date.now()).toISOString(),
          ...(event.id ? { uuid: await uuidFrom(event.id) } : {}),
        }),
      });
    },
  };
}

async function uuidFrom(id: string): Promise<string> {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(id))).slice(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
