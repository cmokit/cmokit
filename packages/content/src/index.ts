// The content server (ADR-0029): CMOkit's remote MCP server for the content plugin, serving MCP over
// Streamable HTTP with no session, and the one-time pages that take a key (ADR-0019). Each customer
// has its own path, `/customers/<slug>/mcp`. The content plugin declares one hosted address, with the
// path `/mcp`, and a call there is routed to the customer the person chose when signing in, which the
// issuer's grant names. It issues no token: it names its issuer in Protected Resource Metadata and
// accepts only tokens the issuer issued for its audience, for a person who is a user of the customer
// served (HST-10). Handlers use the web-standard Request and Response only (ADR-0003); the Worker that
// wires the customer's Durable Object, the vault and the event platform's adapter is worker.ts.

import { Refusal } from './customer.ts';
import { donePage, gonePage, keyPage } from './pages.ts';
import { INSTRUCTIONS, TOOLS, type CustomerCalls } from './tools.ts';

export { Customer, Refusal, SECTIONS, type BrandContext, type CustomerDeps, type Offer, type Piece } from './customer.ts';
export { tally, type EventSummary, type Events, type GuestFacts, type Tally } from './events.ts';
export { PLATFORMS, trackedLink, type Platform } from './links.ts';
export type { Row, Sql } from './sql.ts';
export { TOOLS, type CustomerCalls, type Tool } from './tools.ts';
export { aesGcmVault, type Vault } from './vault.ts';

/** Checks a bearer token with the issuer that issued it. */
export interface Tokens {
  /**
   * The person the token names, the audience it was issued for and the customer chosen when signing
   * in, or undefined when it is not valid.
   */
  check(token: string): Promise<{ person: string; audience: string; customer?: string } | undefined>;
}

/** What the one-time pages call on a customer's records. */
export interface CustomerPages {
  linkFor(token: string): Promise<{ vendor: string; label: string; help: string } | undefined>;
  connect(token: string, key: string): Promise<{ ok: true; calendar: string } | { ok: false; problem: string }>;
}

export interface ContentServerOptions {
  /** The issuer's address, named in Protected Resource Metadata. */
  issuer: string;
  /** The audience the issuer issues the content server's tokens for. */
  audience: string;
  tokens: Tokens;
  /** The records of the customer whose slug the address names. */
  customer(slug: string): CustomerCalls & CustomerPages;
}

const VERSIONS = ['2026-07-28', '2025-11-25', '2025-06-18', '2025-03-26'];
const SLUG = '([a-z0-9][a-z0-9-]{0,62})';
const MCP = new RegExp(`^/customers/${SLUG}/mcp$`);
const METADATA = new RegExp(`^/\\.well-known/oauth-protected-resource/customers/${SLUG}/mcp$`);
const ONE_SLUG = new RegExp(`^${SLUG}$`);
const HOSTED = '/mcp';
const HOSTED_METADATA = '/.well-known/oauth-protected-resource/mcp';
const CONNECT = new RegExp(`^/customers/${SLUG}/connect$`);

type Message = { jsonrpc?: string; id?: string | number | null; method?: string; params?: Record<string, any> };

export function createContentServer(options: ContentServerOptions) {
  return async function handle(request: Request): Promise<Response> {
    const url = new URL(request.url);
    let match: RegExpMatchArray | null;

    if ((match = url.pathname.match(METADATA))) return metadata(request, `${url.origin}/customers/${match[1]}/mcp`, options.issuer);
    if (url.pathname === HOSTED_METADATA) return metadata(request, `${url.origin}${HOSTED}`, options.issuer);

    if ((match = url.pathname.match(CONNECT))) return connectPage(request, url, options.customer(match[1]));

    const slug = url.pathname.match(MCP)?.[1];
    if (slug !== undefined || url.pathname === HOSTED) {
      if (request.method !== 'POST') return new Response(null, { status: 405, headers: { allow: 'POST' } });
      const challenge = () => new Response(null, {
        status: 401,
        headers: { 'www-authenticate': `Bearer resource_metadata="${url.origin}/.well-known/oauth-protected-resource${url.pathname}"` },
      });
      const token = request.headers.get('authorization')?.match(/^Bearer (\S+)$/i)?.[1];
      if (!token) return challenge();
      const checked = await options.tokens.check(token);
      if (!checked || checked.audience !== options.audience) return challenge();
      // At the hosted address, the customer is the one the person chose when signing in.
      const served = slug ?? checked.customer;
      if (served === undefined || !ONE_SLUG.test(served)) {
        return new Response('This sign-in names no customer. Sign in again.', { status: 403 });
      }
      const customer = options.customer(served);
      if (!(await customer.isUser(checked.person))) {
        return new Response('This account is not a user of this customer.', { status: 403 });
      }
      let message: Message;
      try {
        message = await request.json() as Message;
      } catch {
        return Response.json(failure(null, -32700, 'Parse error'), { status: 400 });
      }
      if (Array.isArray(message) || typeof message !== 'object' || message === null) {
        return Response.json(failure(null, -32600, 'Send one JSON-RPC message per request'), { status: 400 });
      }
      if (message.id === undefined) return new Response(null, { status: 202 });
      const answer = await respond(message, { person: checked.person, base: `${url.origin}/customers/${served}`, customer });
      return Response.json(answer);
    }

    return new Response('Not found', { status: 404 });
  };
}

function metadata(request: Request, resource: string, issuer: string): Response {
  if (request.method !== 'GET') return new Response(null, { status: 405, headers: { allow: 'GET' } });
  return Response.json({ resource, authorization_servers: [issuer], bearer_methods_supported: ['header'], resource_name: 'CMOkit' });
}

async function respond(message: Message, context: { person: string; base: string; customer: CustomerCalls }) {
  const { id = null, method, params = {} } = message;
  if (method === 'initialize') {
    const asked = params.protocolVersion;
    return success(id, {
      protocolVersion: VERSIONS.includes(asked) ? asked : VERSIONS[0],
      capabilities: { tools: {} },
      serverInfo: { name: 'cmokit-content', title: 'CMOkit', version: '0.1.0' },
      instructions: INSTRUCTIONS,
    });
  }
  if (method === 'ping') return success(id, {});
  if (method === 'tools/list') return success(id, { tools: TOOLS.map(({ call: _call, ...tool }) => tool) });
  if (method === 'tools/call') {
    const tool = TOOLS.find((t) => t.name === params.name);
    if (!tool) return failure(id, -32602, `Unknown tool: ${params.name}`);
    try {
      const data = await tool.call(params.arguments ?? {}, context);
      const structured = Array.isArray(data) ? { items: data } : data as Record<string, unknown>;
      return success(id, { content: [{ type: 'text', text: JSON.stringify(structured, null, 1) }], structuredContent: structured });
    } catch (error) {
      if (error instanceof Refusal || (error as Error).name === 'Refusal') {
        return success(id, { content: [{ type: 'text', text: (error as Error).message }], isError: true });
      }
      throw error;
    }
  }
  return failure(id, -32601, `Method not found: ${method}`);
}

async function connectPage(request: Request, url: URL, customer: CustomerPages): Promise<Response> {
  if (request.method === 'GET') {
    const token = url.searchParams.get('t') ?? '';
    const link = token ? await customer.linkFor(token) : undefined;
    if (!link) return gonePage();
    return keyPage({ label: link.label, help: link.help, token });
  }
  if (request.method === 'POST') {
    const form = await request.formData();
    const token = String(form.get('t') ?? '');
    const key = String(form.get('key') ?? '');
    const link = token ? await customer.linkFor(token) : undefined;
    if (!link) return gonePage();
    const result = await customer.connect(token, key);
    return result.ok ? donePage(link.label, result.calendar) : keyPage({ label: link.label, help: link.help, token, problem: result.problem });
  }
  return new Response(null, { status: 405, headers: { allow: 'GET, POST' } });
}

const success = (id: string | number | null, result: object) => ({ jsonrpc: '2.0', id, result });
const failure = (id: string | number | null, code: number, message: string) => ({ jsonrpc: '2.0', id, error: { code, message } });
