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
  assert.equal((await rpc(null, 'ada-chose-a-path', 'tools/list')).status, 403);
  assert.equal((await rpc(null, 'other-audience', 'tools/list')).status, 401);
});

test('a person who had no customer at sign-in is served the one they have now, or offered a subscription', async () => {
  const acme = await readyCustomer();
  const customers: Record<string, typeof acme.customer> = { acme: acme.customer };
  const theirs: Record<string, string[]> = { ada: [] };
  const asked: object[] = [];
  const handle = createContentServer({
    issuer: 'https://auth.example', audience: ORIGIN, tokens,
    customer: (slug) => customers[slug] ?? newCustomer().customer,
    customersOf: async (person) => theirs[person] ?? [],
    billing: {
      checkout: async (person, back) => { asked.push({ person, ...back }); return 'https://checkout.example/c/1'; },
      portal: async (billing, returnUrl) => `https://billing.example/${billing}?back=${encodeURIComponent(returnUrl)}`,
    },
  });
  type Answer = { result: { tools?: { name: string }[]; structuredContent?: any; isError?: boolean; content?: { text: string }[] } };
  const rpc = async (method: string, params: object = {}): Promise<Answer> => {
    const response = await handle(new Request(`${ORIGIN}/mcp`, {
      method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ada-chose-nothing' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    }));
    return response.json() as Promise<Answer>;
  };

  // No customer yet: account_status alone, with a checkout link that comes back to the server's own page.
  assert.deepEqual((await rpc('tools/list')).result.tools!.map((t) => t.name), ['account_status']);
  const status = (await rpc('tools/call', { name: 'account_status', arguments: {} })).result.structuredContent;
  assert.deepEqual(status, { access: 'none', connections: [], missing: [{ what: 'subscription', label: 'CMOkit', link: 'https://checkout.example/c/1' }] });
  assert.deepEqual(asked, [{ person: 'ada', successUrl: `${ORIGIN}/subscription?s=started`, cancelUrl: `${ORIGIN}/subscription?s=cancelled` }]);
  assert.equal((await rpc('tools/call', { name: 'brand_read', arguments: {} })).result.isError, true);
  const page = await handle(new Request(`${ORIGIN}/subscription?s=started`));
  assert.match(await page.text(), /Your trial has started/);

  // After checkout the lifecycle made acme with ada as its user; the same token now reaches it.
  theirs.ada = ['acme'];
  await acme.customer.provision('ada', 'cus_123');
  assert.equal((await rpc('tools/list')).result.tools!.length, TOOLS.length);
  const subscribed = (await rpc('tools/call', { name: 'account_status', arguments: {} })).result.structuredContent;
  assert.equal(subscribed.subscription.manage, `https://billing.example/cus_123?back=${encodeURIComponent(`${ORIGIN}/subscription?s=managed`)}`);

  // A lapsed customer keeps account_status, and every other tool refuses.
  await acme.customer.setAccess('lapsed');
  const closed = (await rpc('tools/call', { name: 'brand_read', arguments: {} })).result;
  assert.equal(closed.isError, true);
  assert.match(closed.content![0].text, /lapsed/);
  assert.equal((await rpc('tools/call', { name: 'account_status', arguments: {} })).result.structuredContent.access, 'lapsed');
  await acme.customer.setAccess('active');
  assert.equal((await rpc('tools/call', { name: 'brand_read', arguments: {} })).result.isError, undefined);

  // Two customers since sign-in: the person signs in again to choose.
  theirs.ada = ['acme', 'globex'];
  const two = await handle(new Request(`${ORIGIN}/mcp`, {
    method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ada-chose-nothing' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
  }));
  assert.equal(two.status, 403);
});

test('without billing, a person who is no customer\'s user is told to ask whoever runs the server', async () => {
  const { rpc } = await server();
  const response = await rpc(null, 'ada-chose-nothing', 'tools/call', { name: 'account_status', arguments: {} });
  const { result } = await response.json() as { result: { isError: boolean; content: { text: string }[] } };
  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /Ask whoever runs it/);
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

test('a user who has not accepted the terms is offered account_status alone, whose link accepts them once', async () => {
  const acme = await readyCustomer();
  const terms = { url: 'https://cmokit.example/beta-terms', version: '2026-11-10' };
  const handle = createContentServer({ issuer: 'https://auth.example', audience: ORIGIN, tokens, customer: () => acme.customer, terms });
  const rpc = async (method: string, params: object = {}) => {
    const response = await handle(new Request(`${ORIGIN}/customers/acme/mcp`, {
      method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ada-token' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    }));
    return ((await response.json()) as { result: any }).result;
  };

  assert.deepEqual((await rpc('tools/list')).tools.map((t: { name: string }) => t.name), ['account_status']);
  const brand = await rpc('tools/call', { name: 'brand_read', arguments: {} });
  assert.equal(brand.isError, true);
  assert.match(brand.content[0].text, /beta terms/);

  const status = (await rpc('tools/call', { name: 'account_status', arguments: {} })).structuredContent;
  const item = status.missing[0];
  assert.equal(item.what, 'terms');
  assert.equal(item.terms, terms.url);
  const link = new URL(item.link);
  assert.equal(link.pathname, '/customers/acme/terms');

  const page = await handle(new Request(link));
  assert.equal(page.status, 200);
  assert.match(await page.text(), /https:\/\/cmokit\.example\/beta-terms/);
  const post = (fields: Record<string, string>) => handle(new Request(`${ORIGIN}/customers/acme/terms`, { method: 'POST', body: new URLSearchParams(fields) }));
  assert.equal((await post({ t: link.searchParams.get('t')! })).status, 400, 'the box must be ticked');
  assert.equal((await post({ t: 'forged', accept: 'yes' })).status, 410);
  assert.equal((await post({ t: link.searchParams.get('t')!, accept: 'yes' })).status, 200);
  assert.equal((await post({ t: link.searchParams.get('t')!, accept: 'yes' })).status, 410, 'a link works once');
  assert.equal((await handle(new Request(`${ORIGIN}/customers/acme/connect?t=${link.searchParams.get('t')}`))).status, 410, 'a terms link connects nothing');

  assert.ok((await rpc('tools/list')).tools.length > 1);
  assert.equal((await rpc('tools/call', { name: 'brand_read', arguments: {} })).isError, undefined);
  assert.equal((await rpc('tools/call', { name: 'account_status', arguments: {} })).structuredContent.missing.some((m: { what: string }) => m.what === 'terms'), false);

  // A new version of the terms is accepted again.
  const renewed = createContentServer({ issuer: 'https://auth.example', audience: ORIGIN, tokens, customer: () => acme.customer, terms: { ...terms, version: '2026-12-01' } });
  const listed = await renewed(new Request(`${ORIGIN}/customers/acme/mcp`, {
    method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ada-token' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
  }));
  const list = (await listed.json()) as { result: { tools: unknown[] } };
  assert.equal(list.result.tools.length, 1);
});

test('without terms, the terms page does not exist', async () => {
  const { handle } = await server();
  assert.equal((await handle(new Request(`${ORIGIN}/customers/acme/terms?t=x`))).status, 404);
});

test('terms ticked at sign-in are kept with the customer at the first call, and an older version still asks', async () => {
  const acme = await readyCustomer();
  const terms = { url: 'https://cmokit.example/beta-terms', version: '2026-11-11' };
  const signedIn: Tokens = {
    async check(token) {
      if (token === 'ticked') return { person: 'ada', audience: ORIGIN, terms: '2026-11-11' };
      if (token === 'ticked-before') return { person: 'ada', audience: ORIGIN, terms: '2026-10-01' };
      return undefined;
    },
  };
  const handle = createContentServer({ issuer: 'https://auth.example', audience: ORIGIN, tokens: signedIn, customer: () => acme.customer, terms });
  const list = async (token: string) => {
    const response = await handle(new Request(`${ORIGIN}/customers/acme/mcp`, {
      method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    }));
    return ((await response.json()) as { result: { tools: unknown[] } }).result.tools.length;
  };
  assert.equal(await list('ticked-before'), 1, 'a sign-in that ticked another version accepts nothing');
  assert.equal(await acme.customer.termsAccepted('ada', '2026-11-11'), false);
  assert.equal(await list('ticked'), TOOLS.length);
  assert.equal(await acme.customer.termsAccepted('ada', '2026-11-11'), true);
  const kept = JSON.parse((await acme.customer.exportAll()).json).terms;
  assert.deepEqual(kept.map((t: { person: string; version: string }) => [t.person, t.version]), [['ada', '2026-11-11']]);
});

test("the first time a user's Claude connects is noted, and nothing else is", async () => {
  const { rpc, acme } = await server();
  assert.equal(await acme.customer.claudeConnected('ada'), false);
  await rpc('acme', 'ada-token', 'tools/list');
  assert.equal(await acme.customer.claudeConnected('ada'), false, 'only initializing counts');
  await rpc('acme', 'ada-token', 'initialize', { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'claude', version: '1' } });
  assert.equal(await acme.customer.claudeConnected('ada'), true);
  assert.equal(JSON.parse((await acme.customer.exportAll()).json).claude.length, 1);
});
