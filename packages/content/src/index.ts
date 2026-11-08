// The content server (ADR-0029): CMOkit's remote MCP server for the content plugin, at one address,
// `/mcp`, serving MCP over Streamable HTTP with no session, and the one-time pages that take a key
// (ADR-0019). It issues no token: it names its issuer in Protected Resource Metadata and accepts only
// tokens the issuer issued for its audience. The customer a call acts for is the one the signed-in
// person is a user of; a person who is a user of several names one on the call (HST-10). Handlers use the web-standard Request and Response only (ADR-0003); the Worker that
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

/** What the issuer knows: whose token this is, and which customers that person is a user of. */
export interface Accounts {
  /** The person the token names and the audience it was issued for, or undefined when it is not valid. */
  check(token: string): Promise<{ person: string; audience: string } | undefined>;
  /** The slugs of the customers the person is a user of, from the issuer's index of them (ADR-0030). */
  customersOf(person: string): Promise<string[]>;
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
  accounts: Accounts;
  /** The records of the customer with this slug. */
  customer(slug: string): CustomerCalls & CustomerPages;
}

const VERSIONS = ['2026-07-28', '2025-11-25', '2025-06-18', '2025-03-26'];
const SLUG = '([a-z0-9][a-z0-9-]{0,62})';
const MCP = '/mcp';
const METADATA = '/.well-known/oauth-protected-resource/mcp';
const CONNECT = new RegExp(`^/customers/${SLUG}/connect$`);

type Message = { jsonrpc?: string; id?: string | number | null; method?: string; params?: Record<string, any> };

export function createContentServer(options: ContentServerOptions) {
  return async function handle(request: Request): Promise<Response> {
    const url = new URL(request.url);
    let match: RegExpMatchArray | null;

    if (url.pathname === METADATA) {
      if (request.method !== 'GET') return new Response(null, { status: 405, headers: { allow: 'GET' } });
      return Response.json({
        resource: `${url.origin}${MCP}`,
        authorization_servers: [options.issuer],
        bearer_methods_supported: ['header'],
        resource_name: 'CMOkit',
      });
    }

    if ((match = url.pathname.match(CONNECT))) return connectPage(request, url, options.customer(match[1]));

    if (url.pathname === MCP) {
      if (request.method !== 'POST') return new Response(null, { status: 405, headers: { allow: 'POST' } });
      const challenge = () => new Response(null, {
        status: 401,
        headers: { 'www-authenticate': `Bearer resource_metadata="${url.origin}${METADATA}"` },
      });
      const token = request.headers.get('authorization')?.match(/^Bearer (\S+)$/i)?.[1];
      if (!token) return challenge();
      const checked = await options.accounts.check(token);
      if (!checked || checked.audience !== options.audience) return challenge();
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
      return Response.json(await respond(message, checked.person, url.origin, options));
    }

    return new Response('Not found', { status: 404 });
  };
}

const CHOOSE = {
  type: 'string',
  description: 'Only for a person who works for more than one brand: which one. A call without it, from such a person, lists them.',
};

async function respond(message: Message, person: string, origin: string, options: ContentServerOptions) {
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
  if (method === 'tools/list') {
    return success(id, {
      tools: TOOLS.map(({ call: _call, inputSchema, ...tool }) => ({
        ...tool,
        inputSchema: { ...inputSchema, properties: { ...(inputSchema as { properties?: object }).properties, customer: CHOOSE } },
      })),
    });
  }
  if (method === 'tools/call') {
    const tool = TOOLS.find((t) => t.name === params.name);
    if (!tool) return failure(id, -32602, `Unknown tool: ${params.name}`);
    const { customer: chosen, ...args } = (params.arguments ?? {}) as { customer?: string };
    try {
      const slug = await customerFor(person, chosen, options);
      const customer = options.customer(slug);
      if (!(await customer.isUser(person))) throw new Refusal(`This account is not a user of ${slug}.`);
      const data = await tool.call(args, { person, base: `${origin}/customers/${slug}`, customer });
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

/** The customer a call acts for: the person's only one, or the one they named among theirs. */
async function customerFor(person: string, chosen: string | undefined, options: ContentServerOptions): Promise<string> {
  const theirs = await options.accounts.customersOf(person);
  if (theirs.length === 0) throw new Refusal('This account is not set up with CMOkit yet. Subscribe, or ask the brand that uses CMOkit to add you.');
  if (chosen !== undefined) {
    if (!theirs.includes(chosen)) throw new Refusal(`This account works for ${theirs.join(', ')}, not ${chosen}.`);
    return chosen;
  }
  if (theirs.length > 1) throw new Refusal(`This account works for ${theirs.join(', ')}. Ask the person which, and name it as customer.`);
  return theirs[0];
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
