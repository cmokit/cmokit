import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createContentServer, TOOLS, type Tokens } from '../src/index.ts';
import { CALENDAR_KEY, newCustomer, readyCustomer } from './fixtures.ts';

const ORIGIN = 'https://content.example';
const tokens: Tokens = {
  async check(token) {
    if (token === 'ada-token') return { person: 'ada', audience: ORIGIN };
    if (token === 'bob-token') return { person: 'bob', audience: ORIGIN };
    if (token === 'other-audience') return { person: 'ada', audience: 'https://elsewhere.example' };
    if (token === 'ada-chose-acme') return { person: 'ada', audience: ORIGIN, customer: 'acme' };
    if (token === 'ada-chose-globex') return { person: 'ada', audience: ORIGIN, customer: 'globex' };
    if (token === 'ada-chose-nothing') return { person: 'ada', audience: ORIGIN };
    if (token === 'ada-chose-a-path') return { person: 'ada', audience: ORIGIN, customer: '../acme' };
    return undefined;
  },
};

async function server() {
  const acme = await readyCustomer();
  const globex = newCustomer();
  await globex.customer.addUser('bob');
  const customers: Record<string, typeof acme.customer> = { acme: acme.customer, globex: globex.customer };
  const handle = createContentServer({ issuer: 'https://auth.example', audience: ORIGIN, tokens, customer: (slug) => customers[slug] ?? newCustomer().customer });
  const rpc = (slug: string | null, token: string | undefined, method: string, params: object = {}, id: number | null = 1) => handle(new Request(slug === null ? `${ORIGIN}/mcp` : `${ORIGIN}/customers/${slug}/mcp`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ jsonrpc: '2.0', ...(id === null ? {} : { id }), method, params }),
  }));
  const call = async (slug: string, token: string, name: string, args: object = {}) => {
    const response = await rpc(slug, token, 'tools/call', { name, arguments: args });
    return (await response.json() as { result: { content: { text: string }[]; structuredContent?: any; isError?: boolean } }).result;
  };
  return { handle, rpc, call, acme };
}

test('Protected Resource Metadata names the issuer, and a call without a valid token is pointed at it', async () => {
  const { handle, rpc } = await server();
  const metadata = await handle(new Request(`${ORIGIN}/.well-known/oauth-protected-resource/customers/acme/mcp`));
  assert.deepEqual(await metadata.json(), {
    resource: `${ORIGIN}/customers/acme/mcp`, authorization_servers: ['https://auth.example'],
    bearer_methods_supported: ['header'], resource_name: 'CMOkit',
  });
  for (const token of [undefined, 'forged', 'other-audience']) {
    const refused = await rpc('acme', token, 'tools/list');
    assert.equal(refused.status, 401, `token ${token}`);
    assert.equal(refused.headers.get('www-authenticate'), `Bearer resource_metadata="${ORIGIN}/.well-known/oauth-protected-resource/customers/acme/mcp"`);
  }
});

test('the hosted address serves the customer chosen at sign-in, and only to its users', async () => {
  const { handle, rpc } = await server();
  const metadata = await handle(new Request(`${ORIGIN}/.well-known/oauth-protected-resource/mcp`));
  assert.deepEqual(await metadata.json(), {
    resource: `${ORIGIN}/mcp`, authorization_servers: ['https://auth.example'],
    bearer_methods_supported: ['header'], resource_name: 'CMOkit',
  });
  const refused = await rpc(null, undefined, 'tools/list');
  assert.equal(refused.status, 401);
  assert.equal(refused.headers.get('www-authenticate'), `Bearer resource_metadata="${ORIGIN}/.well-known/oauth-protected-resource/mcp"`);

  const brand = await rpc(null, 'ada-chose-acme', 'tools/call', { name: 'brand_read', arguments: {} });
  assert.equal(brand.status, 200);
  const result = (await brand.json() as { result: { structuredContent: { version: number } } }).result;
  assert.equal(typeof result.structuredContent.version, 'number');

  assert.equal((await rpc(null, 'ada-chose-globex', 'tools/list')).status, 403);
  assert.equal((await rpc(null, 'ada-chose-nothing', 'tools/list')).status, 403);
  assert.equal((await rpc(null, 'ada-chose-a-path', 'tools/list')).status, 403);
  assert.equal((await rpc(null, 'other-audience', 'tools/list')).status, 401);
});

test('a person is refused at another customer\'s address', async () => {
  const { rpc } = await server();
  assert.equal((await rpc('acme', 'bob-token', 'tools/list')).status, 403);
  assert.equal((await rpc('globex', 'ada-token', 'tools/call', { name: 'brand_read', arguments: {} })).status, 403);
  assert.equal((await rpc('globex', 'bob-token', 'tools/list')).status, 200);
});

test('MCP over Streamable HTTP, statelessly: initialize, notifications, tools', async () => {
  const { rpc, handle } = await server();
  const init = await (await rpc('acme', 'ada-token', 'initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1' } })).json() as any;
  assert.equal(init.result.protocolVersion, '2025-06-18');
  assert.match(init.result.instructions, /brand_read before writing/);
  assert.match(init.result.instructions, /Never accept a credential/);
  assert.equal((await rpc('acme', 'ada-token', 'notifications/initialized', {}, null)).status, 202);
  assert.equal((await handle(new Request(`${ORIGIN}/customers/acme/mcp`, { headers: { authorization: 'Bearer ada-token' } }))).status, 405);
  const listed = await (await rpc('acme', 'ada-token', 'tools/list')).json() as any;
  assert.deepEqual(listed.result.tools.map((t: { name: string }) => t.name), [
    'account_status', 'brand_read', 'brand_change', 'brand_history', 'offers_list', 'piece_save', 'pieces_list', 'results_read',
  ]);
});

test('every tool has a title and read-only and destructive hints, and no input takes a credential', () => {
  const names = (schema: any): string[] => Object.entries(schema.properties ?? {}).flatMap(([name, inner]: [string, any]) =>
    [name, ...names(inner), ...(inner.items ? names(inner.items) : [])]);
  for (const tool of TOOLS) {
    assert.ok(tool.title && tool.annotations.title, `${tool.name} has a title`);
    assert.equal(typeof tool.annotations.readOnlyHint, 'boolean');
    assert.equal(typeof tool.annotations.destructiveHint, 'boolean');
    for (const name of names(tool.inputSchema)) assert.doesNotMatch(name, /key|token|secret|password|credential/i, `${tool.name}.${name}`);
  }
});

test('a tool call reaches only its customer\'s records, and a refusal is a tool error', async () => {
  const { call } = await server();
  const brand = await call('acme', 'ada-token', 'brand_read');
  assert.equal(brand.structuredContent.version, 1);
  assert.equal((await call('globex', 'bob-token', 'brand_read')).structuredContent.version, 0);
  const planned = await call('acme', 'ada-token', 'piece_save', {
    signal: 'planned', week: '2026-W47', offer: 'table', format: 'teaser', kind: 'reel', destination: 'https://luma.com/table-nov',
  });
  assert.equal(planned.structuredContent.links.instagram, 'https://luma.com/table-nov?utm_source=instagram&utm_medium=social&utm_campaign=table&utm_content=p1');
  assert.equal((await call('acme', 'ada-token', 'pieces_list')).structuredContent.items.length, 1);
  assert.equal((await call('globex', 'bob-token', 'pieces_list')).structuredContent.items.length, 0);
  const refused = await call('acme', 'ada-token', 'brand_change', { approved: false, base_version: 1, reason: 'x', sections: { voice: 'y' } });
  assert.equal(refused.isError, true);
  assert.match(refused.content[0].text, /approves/);
  const status = await call('acme', 'ada-token', 'account_status');
  assert.doesNotMatch(JSON.stringify(status), new RegExp(CALENDAR_KEY), 'no result carries a stored credential');
});

test('the one-time page takes a key once, and never through MCP', async () => {
  const { handle, call } = await server();
  const fresh = await call('globex', 'bob-token', 'account_status');
  const link = fresh.structuredContent.missing[0].link as string;
  assert.ok(link.startsWith(`${ORIGIN}/customers/globex/connect?t=`));
  const page = await handle(new Request(link));
  assert.equal(page.status, 200);
  assert.match(await page.text(), /type="password"/);
  assert.equal(page.headers.get('cache-control'), 'no-store');

  const token = new URL(link).searchParams.get('t')!;
  const post = (key: string) => handle(new Request(`${ORIGIN}/customers/globex/connect`, { method: 'POST', body: new URLSearchParams({ t: token, key }) }));
  const wrong = await post('nope');
  assert.equal(wrong.status, 400);
  assert.match(await wrong.text(), /did not accept/);
  const right = await post(CALENDAR_KEY);
  assert.match(await right.text(), /is connected/);
  assert.equal((await post(CALENDAR_KEY)).status, 410);
  assert.equal((await handle(new Request(link))).status, 410);
  assert.equal((await call('globex', 'bob-token', 'account_status')).structuredContent.missing.length, 0);
  assert.equal((await handle(new Request(`${ORIGIN}/customers/acme/connect?t=${token}`))).status, 410, 'a link is for its own customer');
});
