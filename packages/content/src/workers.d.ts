// The one part of the Workers runtime the content server's Worker uses: the base class of an entrypoint that
// another Worker calls over a service binding. Cloudflare's own types describe it in full.

declare module 'cloudflare:workers' {
  export abstract class WorkerEntrypoint<Env = unknown> {
    protected ctx: { waitUntil(promise: Promise<unknown>): void; passThroughOnException(): void };
    protected env: Env;
    constructor(ctx: unknown, env: Env);
  }
}
