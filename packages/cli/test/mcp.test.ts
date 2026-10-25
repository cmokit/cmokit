import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Config, Experiment } from '../src/index.ts';
import { createServer } from '../src/mcp.ts';
import { run } from '../src/command.ts';
import { standIn } from './stand-in.ts';

const landing = (status: Experiment['status']): Experiment => ({
  flag: 'landing', path: '/', variants: { b: '/variants/landing/b/' }, goal: 'signup', status,
});

const config = (...experiments: Experiment[]): Config => ({
  analytics: { posthog: { key: 'phc_test', project: 7 } },
  experiments,
});

function server(tool: ReturnType<typeof standIn>, c: Config, env: Record<string, string> = { POSTHOG_PERSONAL_API_KEY: 'phx_secret' }) {
  const handle = createServer('cmokit.config.ts', { env, load: async () => c, fetch: tool.fetch });
  let id = 0;
  const request = async (method: string, params?: object) => {
    const answer = await handle(JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params })) as any;
    assert.equal(answer.jsonrpc, '2.0');
    assert.equal(answer.id, id);
    return answer;
  };
  const call = async (name: string, args: object = {}) => (await request('tools/call', { name, arguments: args })).result;
  return { handle, request, call };
}

test('the server introduces itself and lists its tools, none of which changes the tool', async () => {
  const { handle, request } = server(standIn(), config());
  const init = await request('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1' } });
  assert.equal(init.result.protocolVersion, '2025-06-18');
  assert.deepEqual(init.result.capabilities, { tools: {} });
  assert.equal(init.result.serverInfo.name, 'cmokit');
  assert.match(init.result.serverInfo.version, /^\d+\.\d+\.\d+/);
  assert.match(init.result.instructions, /cmokit\.config\.ts/);
  assert.equal(await handle(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })), undefined);

  const unknownVersion = await request('initialize', { protocolVersion: '1999-01-01' });
  assert.equal(unknownVersion.result.protocolVersion, '2025-11-25');

  const { tools } = (await request('tools/list')).result;
  assert.deepEqual(tools.map((t: { name: string }) => t.name), ['experiments_plan', 'experiments_results', 'experiments_preview_sync']);
  for (const tool of tools) {
    assert.equal(tool.inputSchema.type, 'object');
    assert.equal('call' in tool, false);
  }
  assert.deepEqual((await request('ping')).result, {});
});

test('experiments_plan answers in words and in data', async () => {
  const tool = standIn([], { reached: 1400, converted: 42 });
  const result = await server(tool, config(landing('draft'))).call('experiments_plan', { effect: 30 });
  assert.equal(result.isError, undefined);
  assert.equal(result.content[0].type, 'text');
  assert.match(result.content[0].text, /Detecting a 30% lift needs 11,498 visitors across 2 variants: about 115 days\./);
  assert.equal(result.structuredContent.experiments[0].estimate.sampleSize, 11498);
});

test('experiments_results reads a running experiment', async () => {
  const tool = standIn([], {
    results: { status: 200, body: { baseline: { key: 'control', number_of_samples: 10, sum: 1 }, variant_results: [] } },
  });
  await run(['experiments', 'sync'], {
    env: { POSTHOG_PERSONAL_API_KEY: 'phx_secret' }, out: () => {}, load: async () => config(landing('running')), fetch: tool.fetch,
  });
  const result = await server(tool, config(landing('running'))).call('experiments_results', { flag: 'landing' });
  assert.match(result.content[0].text, /^landing, on \/: running since 2026-10-24/);
  assert.equal(result.structuredContent.experiments[0].state, 'running');
});

test('experiments_preview_sync says what the deploy would do and changes nothing', async () => {
  const tool = standIn();
  const result = await server(tool, config(landing('running'))).call('experiments_preview_sync');
  assert.equal(result.content[0].text, 'would create landing\nwould launch landing');
  assert.deepEqual(result.structuredContent.steps, [{ action: 'create', flag: 'landing' }, { action: 'launch', flag: 'landing' }]);
  assert.deepEqual(tool.changes, []);
});

test('a missing key is a tool error that tells the agent to ask for the variable, not the key', async () => {
  const result = await server(standIn(), config(), {}).call('experiments_plan');
  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /POSTHOG_PERSONAL_API_KEY is not set .* Never ask for the key itself\./);
});

test('bad input is refused as JSON-RPC errors or tool errors', async () => {
  const { handle, request, call } = server(standIn(), config(landing('draft')));
  assert.deepEqual(await handle('not json'), { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } });
  assert.equal((await request('resources/list')).error.code, -32601);
  assert.equal((await request('tools/call', { name: 'experiments_launch' })).error.code, -32602);
  assert.equal((await call('experiments_plan', { effect: -5 })).isError, true);
  assert.match((await call('experiments_results', { flag: 'nope' })).content[0].text, /no experiment "nope"/);
});
