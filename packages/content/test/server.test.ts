import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createContentServer, TOOLS, type Accounts } from '../src/index.ts';
import { CALENDAR_KEY, newCustomer, readyCustomer } from './fixtures.ts';

const ORIGIN = 'https://content.example';
const MEMBERSHIPS: Record<string, string[]> = { ada: ['acme'], bob: ['globex'], cy: ['acme', 'globex'], eve: ['acme'] };
const accounts: Accounts = {
  async check(token) {
    const person = token.replace(/-token$/, '');
    if (token === 'other-audience') return { person: 'ada', audience: 'https://elsewhere.example' };
    if (token.endsWith('-token') && person in MEMBERSHIPS || token === 'dan-token') return { person, audience: ORIGIN };
    return undefined;
  },
  async customersOf(person) {
    return MEMBERSHIPS[person] ?? [];
  },
};

async function server() {
  const acme = await readyCustomer();
  const globex = newCustomer();
  await globex.customer.addUser('bob');
  await acme.customer.addUser('cy');
  await globex.customer.addUser('cy');
  const customers: Record<string, typeof acme.customer> = { acme: acme.customer, globex: globex.customer };
  const handle = createContentServer({ issuer: 'https://auth.example', audience: ORIGIN, accounts, customer: (slug) => customers[slug] ?? newCustomer().customer });
  const rpc = (token: string | undefined, method: string, params: object = {}, id: number | null = 1) => handle(new Request(`${ORIGIN}/mcp`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ jsonrpc: '2.0', ...(id === null ? {} : { id }), method, params }),
  }));
  const call = async (token: string, name: string, args: object = {}) => {
    const response = await rpc(token, 'tools/call', { name, arguments: args });
    return (await response.json() as { result: { content: { text: string }[]; structuredContent?: any; isError?: boolean } }).result;
  };
  return { handle, rpc, call, acme };
}

test('Protected Resource Metadata names the issuer, and a call without a valid token is pointed at it', async () => {
  const { handle, rpc } = await server();
  const metadata = await handle(new Request(`${ORIGIN}/.well-known/oauth-protected-resource/mcp`));
  assert.deepEqual(await metadata.json(), {
    resource: `${ORIGIN}/mcp`, authorization_servers: ['https://auth.example'],
    bearer_methods_supported: ['header'], resource_name: 'CMOkit',
  });
  for (const token of [undefined, 'forged', 'other-audience']) {
    const refused = await rpc(token, 'tools/list');
    assert.equal(refused.status, 401, `token ${token}`);
    assert.equal(refused.headers.get('www-authenticate'), `Bearer resource_metadata="${ORIGIN}/.well-known/oauth-protected-resource/mcp"`);
  }
});

test('one address: each person reaches their own customer, and one with several names which', async () => {
  const { call } = await server();
  assert.equal((await call('ada-token', 'brand_read')).structuredContent.version, 1);
  assert.equal((await call('bob-token', 'brand_read')).structuredContent.version, 0);

  const other = await call('ada-token', 'brand_read', { customer: 'globex' });
  assert.equal(other.isError, true);
  assert.match(other.content[0].text, /works for acme, not globex/);

  const unsure = await call('cy-token', 'brand_read');
  assert.equal(unsure.isError, true);
  assert.match(unsure.content[0].text, /acme, globex/);
  assert.equal((await call('cy-token', 'brand_read', { customer: 'acme' })).structuredContent.version, 1);
  assert.equal((await call('cy-token', 'brand_read', { customer: 'globex' })).structuredContent.version, 0);

  const nobody = await call('dan-token', 'brand_read');
  assert.equal(nobody.isError, true);
  assert.match(nobody.content[0].text, /not set up/);

  const stale = await call('eve-token', 'brand_read');
  assert.equal(stale.isError, true, 'the customer\'s own list of users is the authority, not the index');
  assert.match(stale.content[0].text, /not a user of acme/);
});

test('MCP over Streamable HTTP, statelessly: initialize, notifications, tools', async () => {
  const { rpc, handle } = await server();
  const init = await (await rpc('ada-token', 'initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1' } })).json() as any;
  assert.equal(init.result.protocolVersion, '2025-06-18');
  assert.match(init.result.instructions, /brand_read before writing/);
  assert.match(init.result.instructions, /Never accept a credential/);
  assert.equal((await rpc('ada-token', 'notifications/initialized', {}, null)).status, 202);
  assert.equal((await handle(new Request(`${ORIGIN}/mcp`, { headers: { authorization: 'Bearer ada-token' } }))).status, 405);
  const listed = await (await rpc('ada-token', 'tools/list')).json() as any;
  assert.deepEqual(listed.result.tools.map((t: { name: string }) => t.name), [
    'account_status', 'brand_read', 'brand_change', 'brand_history', 'offers_list', 'piece_save', 'pieces_list', 'results_read',
  ]);
  for (const tool of listed.result.tools) assert.equal(tool.inputSchema.properties.customer.type, 'string', `${tool.name} can name a customer`);
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
  const brand = await call('ada-token', 'brand_read');
  assert.equal(brand.structuredContent.version, 1);
  assert.equal((await call('bob-token', 'brand_read')).structuredContent.version, 0);
  const planned = await call('ada-token', 'piece_save', {
    signal: 'planned', week: '2026-W47', offer: 'table', format: 'teaser', kind: 'reel', destination: 'https://luma.com/table-nov',
  });
  assert.equal(planned.structuredContent.links.instagram, 'https://luma.com/table-nov?utm_source=instagram&utm_medium=social&utm_campaign=table&utm_content=p1');
  assert.equal((await call('ada-token', 'pieces_list')).structuredContent.items.length, 1);
  assert.equal((await call('bob-token', 'pieces_list')).structuredContent.items.length, 0);
  const refused = await call('ada-token', 'brand_change', { approved: false, base_version: 1, reason: 'x', sections: { voice: 'y' } });
  assert.equal(refused.isError, true);
  assert.match(refused.content[0].text, /approves/);
  const status = await call('ada-token', 'account_status');
  assert.doesNotMatch(JSON.stringify(status), new RegExp(CALENDAR_KEY), 'no result carries a stored credential');
});

test('the one-time page takes a key once, and never through MCP', async () => {
  const { handle, call } = await server();
  const fresh = await call('bob-token', 'account_status');
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
  assert.equal((await call('bob-token', 'account_status')).structuredContent.missing.length, 0);
  assert.equal((await handle(new Request(`${ORIGIN}/customers/acme/connect?t=${token}`))).status, 410, 'a link is for its own customer');
});
