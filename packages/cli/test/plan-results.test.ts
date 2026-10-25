import assert from 'node:assert/strict';
import { test } from 'node:test';
import { run } from '../src/command.ts';
import type { Config, Experiment, Status } from '../src/index.ts';
import { standIn, type Analytics } from './stand-in.ts';

const landing = (status: Status, extra: Partial<Experiment> = {}): Experiment => ({
  flag: 'landing', path: '/', variants: { b: '/variants/landing/b/' }, goal: 'signup', status, ...extra,
});

const pricing = (status: Status): Experiment => ({
  flag: 'pricing', path: '/pricing/', variants: { b: '/v/b/', c: '/v/c/' }, goal: 'signup', status,
});

const config = (...experiments: Experiment[]): Config => ({
  analytics: { posthog: { key: 'phc_test', project: 7 } },
  experiments,
});

async function cmokit(tool: ReturnType<typeof standIn>, c: Config, ...args: string[]) {
  const lines: string[] = [];
  const code = await run(['experiments', ...args], {
    env: { POSTHOG_PERSONAL_API_KEY: 'phx_secret' },
    out: (line) => lines.push(line),
    load: async () => c,
    fetch: tool.fetch,
  });
  return { code, lines };
}

/** A tool holding `landing` launched, answering its results query with `results`. */
async function launched(results: Analytics['results']) {
  const tool = standIn([], { results });
  await cmokit(tool, config(landing('running')), 'sync');
  tool.asked.length = 0;
  return tool;
}

test('plan estimates the running time from the page\'s traffic and the goal\'s baseline there', async () => {
  // 100 visitors a day reach the page, and 3% of them sign up.
  const tool = standIn([], { reached: 1400, converted: 42 });
  const { code, lines } = await cmokit(tool, config(landing('draft')), 'plan');
  assert.equal(code, 0);
  assert.deepEqual(lines, [
    'landing, on /: 100 visitors a day over the last 14 days, 3.0% of whom sent signup.',
    '  Detecting a 30% lift needs 11,498 visitors across 2 variants: about 115 days.',
  ]);
  const [context, sizing] = tool.asked;
  assert.equal(context.path, '/experiments/setup_context/');
  assert.equal(context.body.target_event, '$pageview');
  assert.deepEqual(context.body.target_properties, [{ type: 'event', key: '$pathname', operator: 'exact', value: ['/'] }]);
  assert.equal(context.body.metric_event, 'signup');
  assert.deepEqual(sizing.body, { metric_type: 'funnel', minimum_detectable_effect: 30, number_of_variants: 2, baseline_value: 0.03 });
});

test('plan takes the effect to detect, and counts a page with and without its trailing slash', async () => {
  const tool = standIn([], { reached: 1400, converted: 42 });
  const { lines } = await cmokit(tool, config(landing('ended'), pricing('draft')), 'plan', '--effect', '50');
  assert.equal(lines.length, 2, 'the ended experiment is left out');
  assert.match(lines[1], /Detecting a 50% lift needs [\d,]+ visitors across 3 variants/);
  assert.deepEqual(tool.asked[0].body.target_properties[0].value, ['/pricing', '/pricing/']);
  assert.equal(tool.asked[1].body.minimum_detectable_effect, 50);
});

test('plan says when there is no baseline, and asks for no sample size', async () => {
  const quiet = standIn([], { reached: 0 });
  assert.deepEqual((await cmokit(quiet, config(landing('draft')), 'plan')).lines, [
    'landing, on /: no visitor reached the page in the last 14 days, so there is no baseline to plan from.',
  ]);
  const unconverted = standIn([], { reached: 700, converted: 0 });
  assert.deepEqual((await cmokit(unconverted, config(landing('draft')), 'plan')).lines, [
    'landing, on /: 50 visitors a day over the last 14 days, none of whom sent signup, so there is no baseline to plan from.',
  ]);
  assert.deepEqual([...quiet.asked, ...unconverted.asked].map((a) => a.path), ['/experiments/setup_context/', '/experiments/setup_context/']);
});

test('plan and results name one experiment, and refuse one the configuration lacks', async () => {
  const tool = standIn([], { reached: 1400, converted: 42 });
  const { lines } = await cmokit(tool, config(landing('draft'), pricing('draft')), 'plan', 'pricing', '--json');
  const [only] = JSON.parse(lines.join('\n'));
  assert.equal(only.flag, 'pricing');
  assert.equal(only.estimate.sampleSize > 0, true);
  const missing = await cmokit(tool, config(landing('draft')), 'results', 'nope');
  assert.equal(missing.code, 1);
  assert.deepEqual(missing.lines, ['cmokit: the configuration has no experiment "nope"']);
});

test('results reads a running experiment\'s results as PostHog computes them', async () => {
  const tool = await launched({
    status: 200,
    body: {
      baseline: { key: 'control', number_of_samples: 1000, sum: 30, sum_squares: 30 },
      variant_results: [{
        key: 'b', method: 'bayesian', number_of_samples: 990, sum: 45, sum_squares: 45,
        chance_to_win: 0.964, credible_interval: [0.021, 0.95], significant: true,
      }],
    },
  });
  const { code, lines } = await cmokit(tool, config(landing('running')), 'results');
  assert.equal(code, 0);
  assert.deepEqual(lines, [
    'landing, on /: running since 2026-10-24, judged by Bayesian statistics.',
    '  control  1,000 exposed, 30 converted (3.0%)',
    '  b        990 exposed, 45 converted (4.5%): lift +2% to +95%, chance to win 96%, significant',
  ]);
  const [query] = tool.asked;
  assert.equal(query.path, '/query/');
  assert.equal(query.body.query.kind, 'ExperimentQuery');
  assert.equal(query.body.query.experiment_id, tool.held[0].id);
  assert.deepEqual(query.body.query.metric.series, [{ kind: 'EventsNode', event: 'signup' }]);
});

test('results waits while the control has no exposures, and does not query a draft', async () => {
  const tool = await launched({
    status: 400,
    body: { type: 'validation_error', code: 'no_data', detail: "No exposures for the 'control' variant yet." },
  });
  assert.deepEqual((await cmokit(tool, config(landing('running')), 'results')).lines, [
    "landing, on /: running since 2026-10-24. No results yet: No exposures for the 'control' variant yet.",
  ]);

  const drafts = standIn();
  await cmokit(drafts, config(landing('draft')), 'sync');
  assert.deepEqual((await cmokit(drafts, config(landing('draft'), pricing('draft')), 'results')).lines, [
    'landing, on /: not started.',
    'pricing, on /pricing: not started.',
  ]);
  assert.deepEqual(drafts.asked, []);
});

test('results reports any other refusal from PostHog as an error', async () => {
  const tool = await launched({ status: 403, body: { detail: 'API key missing required scope query:read' } });
  const { code, lines } = await cmokit(tool, config(landing('running')), 'results');
  assert.equal(code, 1);
  assert.match(lines[0], /^cmokit: PostHog POST \/query\/ answered 403: .*query:read/);
});

test('each command takes only its own options', async () => {
  const tool = standIn();
  assert.equal((await cmokit(tool, config(), 'sync', '--json')).code, 2);
  assert.equal((await cmokit(tool, config(), 'results', '--effect', '10')).code, 2);
  assert.equal((await cmokit(tool, config(), 'plan', '--effect', 'none')).code, 2);
  assert.equal((await cmokit(tool, config(), 'plan', 'a', 'b')).code, 2);
});
