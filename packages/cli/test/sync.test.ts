import assert from 'node:assert/strict';
import { test } from 'node:test';
import { run } from '../src/command.ts';
import { plan, type ToolExperiment } from '../src/experiments.ts';
import { resolve, type Config, type Experiment, type Status } from '../src/index.ts';
import { MANAGED } from '../src/posthog.ts';

const APP = 'https://us.posthog.com';
const BASE = `${APP}/api/projects/7`;

interface Held {
  id: number;
  description: string;
  feature_flag_key: string;
  feature_flag: { id: number; filters: { multivariate: { variants: { key: string; rollout_percentage: number }[] } } };
  metrics: unknown[];
  start_date: string | null;
  end_date: string | null;
  archived: boolean;
  deleted: boolean;
}

// A stand-in for PostHog's experiments API, holding experiments in memory and recording each change.
function standIn(held: Held[] = []) {
  const changes: string[] = [];
  const flagsDeleted: number[] = [];
  let nextId = 100;
  const fetch = (async (input: string | URL, init: RequestInit = {}) => {
    const url = String(input);
    const method = init.method ?? 'GET';
    assert.equal(new Headers(init.headers).get('authorization'), 'Bearer phx_secret');
    const body = init.body ? JSON.parse(String(init.body)) : undefined;
    const path = url.slice(BASE.length);
    const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
    const find = (id: string) => held.find((e) => String(e.id) === id && !e.deleted);

    if (method === 'GET' && path === '/experiments/?limit=100') {
      // The list leaves out the flag and the metrics, as PostHog's does.
      return json({ next: null, results: held.filter((e) => !e.deleted).map(({ feature_flag: _f, metrics: _m, ...e }) => e) });
    }
    let m = path.match(/^\/feature_flags\/(\d+)\/$/);
    if (m && method === 'PATCH') {
      flagsDeleted.push(Number(m[1]));
      return json({});
    }
    if (method === 'POST' && path === '/experiments/') {
      const id = nextId++;
      held.push({
        id, description: body.description, feature_flag_key: body.feature_flag_key,
        feature_flag: { id: id + 1000, filters: body.feature_flag.filters }, metrics: body.metrics,
        start_date: null, end_date: null, archived: false, deleted: false,
      });
      changes.push(`create ${body.feature_flag_key}`);
      return json({ id }, 201);
    }
    m = path.match(/^\/experiments\/(\d+)\/(?:(launch|end|archive)\/)?$/);
    const e = m ? find(m[1]) : undefined;
    if (!m || !e) return json({ detail: 'Not found.' }, 404);
    const action = m[2];
    if (method === 'GET' && !action) return json(e);
    if (method === 'PATCH' && !action) {
      if (body.deleted) e.deleted = true;
      if (body.feature_flag) e.feature_flag.filters = body.feature_flag.filters;
      if (body.metrics) e.metrics = body.metrics;
      changes.push(`${body.deleted ? 'delete' : 'update'} ${e.feature_flag_key}`);
      return json(e);
    }
    if (action === 'launch') {
      if (e.start_date) return json({ detail: 'already launched' }, 400);
      e.start_date = '2026-10-24T00:00:00Z';
    }
    if (action === 'end') {
      if (!e.start_date || e.end_date) return json({ detail: 'not running' }, 400);
      e.end_date = '2026-10-31T00:00:00Z';
    }
    if (action === 'archive') {
      if (!e.end_date) return json({ detail: 'not ended' }, 400);
      assert.equal(body.disable_feature_flag, true);
      e.archived = true;
    }
    changes.push(`${action} ${e.feature_flag_key}`);
    return json(e);
  }) as typeof globalThis.fetch;
  return { held, changes, flagsDeleted, fetch };
}

const landing = (status: Status, extra: Partial<Experiment> = {}): Experiment => ({
  flag: 'landing', path: '/', variants: { b: '/variants/landing/b/' }, goal: 'signup', status, ...extra,
});

const config = (...experiments: Experiment[]): Config => ({
  analytics: { posthog: { key: 'phc_test', project: 7 } },
  experiments,
});

async function cmokit(tool: ReturnType<typeof standIn>, c: Config, ...flags: string[]) {
  const lines: string[] = [];
  const code = await run(['experiments', 'sync', ...flags], {
    env: { POSTHOG_PERSONAL_API_KEY: 'phx_secret' },
    out: (line) => lines.push(line),
    load: async () => c,
    fetch: tool.fetch,
  });
  return { code, lines };
}

test('an experiment goes from draft to running to ended to archived, and each second run changes nothing', async () => {
  const tool = standIn();
  const expect = async (c: Config, changes: string[]) => {
    tool.changes.length = 0;
    assert.equal((await cmokit(tool, c)).code, 0);
    assert.deepEqual(tool.changes, changes);
    tool.changes.length = 0;
    const again = await cmokit(tool, c);
    assert.deepEqual(tool.changes, []);
    assert.deepEqual(again.lines, ['The experiments tool already matches the configuration.']);
  };

  await expect(config(landing('draft')), ['create landing']);
  const created = tool.held[0];
  assert.ok(created.description.startsWith(MANAGED));
  assert.deepEqual(created.feature_flag.filters.multivariate.variants, [
    { key: 'control', rollout_percentage: 50 }, { key: 'b', rollout_percentage: 50 },
  ]);
  assert.deepEqual(created.metrics, [{
    kind: 'ExperimentMetric', metric_type: 'funnel', name: 'signup', series: [{ kind: 'EventsNode', event: 'signup' }],
  }]);

  await expect(config(landing('draft', { split: { control: 80, b: 20 } })), ['update landing']);
  await expect(config(landing('running', { split: { control: 80, b: 20 } })), ['launch landing']);
  await expect(config(landing('ended', { split: { control: 80, b: 20 } })), ['end landing']);
  await expect(config(), ['archive landing']);
});

test('a new running experiment is created and launched in one sync', async () => {
  const tool = standIn();
  await cmokit(tool, config(landing('running')));
  assert.deepEqual(tool.changes, ['create landing', 'launch landing']);
});

test('a running experiment removed from the configuration is ended and archived', async () => {
  const tool = standIn();
  await cmokit(tool, config(landing('running')));
  tool.changes.length = 0;
  await cmokit(tool, config());
  assert.deepEqual(tool.changes, ['end landing', 'archive landing']);
});

test('a draft removed from the configuration, or ended before it ran, is deleted with its flag', async () => {
  for (const after of [config(), config(landing('ended'))]) {
    const tool = standIn();
    await cmokit(tool, config(landing('draft')));
    tool.changes.length = 0;
    await cmokit(tool, after);
    assert.deepEqual(tool.changes, ['delete landing']);
    assert.deepEqual(tool.flagsDeleted, [1100]);
  }
});

test('a dry run says what would change and changes nothing', async () => {
  const tool = standIn();
  const { code, lines } = await cmokit(tool, config(landing('running')), '--dry-run');
  assert.equal(code, 0);
  assert.deepEqual(lines, ['would create landing', 'would launch landing']);
  assert.deepEqual(tool.changes, []);
});

test('an experiment CMOkit did not create is refused, and nothing else changes', async () => {
  const tool = standIn([{
    id: 1, description: 'Made by hand', feature_flag_key: 'landing',
    feature_flag: { id: 2, filters: { multivariate: { variants: [] } } }, metrics: [],
    start_date: null, end_date: null, archived: false, deleted: false,
  }]);
  const pricing: Experiment = { flag: 'pricing', path: '/pricing/', variants: { b: '/v/b/' }, goal: 'signup', status: 'draft' };
  const { code, lines } = await cmokit(tool, config(landing('draft'), pricing));
  assert.equal(code, 1);
  assert.match(lines[0], /did not create/);
  assert.deepEqual(tool.changes, []);
});

test('the plan refuses what the tool cannot do', () => {
  const held = (state: ToolExperiment['state'], extra: Partial<ToolExperiment> = {}): ToolExperiment[] => [{
    id: '1', flag: 'landing', managed: true, state, split: { control: 50, b: 50 }, goal: 'signup', ...extra,
  }];
  const problems = (status: Status, tool: ToolExperiment[], extra: Partial<Experiment> = {}) =>
    plan(resolve(config(landing(status, extra))), tool).problems;
  assert.match(problems('draft', held('running'))[0], /cannot return to draft/);
  assert.match(problems('running', held('running', { goal: 'other' }))[0], /cannot change while it runs/);
  assert.match(problems('running', held('running'), { split: { control: 90, b: 10 } })[0], /cannot change while it runs/);
  assert.match(problems('running', held('ended'))[0], /cannot start again/);
  assert.deepEqual(problems('ended', held('ended')), []);
  assert.match(problems('draft', [...held('draft'), ...held('draft', { id: '2' })])[0], /2 experiments on this flag/);
});

test('the command needs a project id and the key, and names the key without its value', async () => {
  const tool = standIn();
  const noProject = await cmokit(tool, { analytics: { posthog: { key: 'phc_test' } }, experiments: [] });
  assert.deepEqual(noProject.lines, ['cmokit: analytics.posthog.project is missing from the configuration']);
  const lines: string[] = [];
  const code = await run(['experiments', 'sync'], { env: {}, out: (l) => lines.push(l), load: async () => config() });
  assert.equal(code, 1);
  assert.deepEqual(lines, ['cmokit: POSTHOG_PERSONAL_API_KEY is not set']);
  assert.equal(await run(['nonsense'], { env: {}, out: () => {} }), 2);
});

test('a refusal from PostHog is reported with its status', async () => {
  const tool = standIn();
  const failing = (async () => new Response('{"detail":"Invalid token"}', { status: 401 })) as typeof fetch;
  const { code, lines } = await cmokit({ ...tool, fetch: failing }, config(landing('draft')));
  assert.equal(code, 1);
  assert.match(lines[0], /answered 401: \{"detail":"Invalid token"\}/);
  assert.doesNotMatch(lines.join('\n'), /phx_secret/);
});
