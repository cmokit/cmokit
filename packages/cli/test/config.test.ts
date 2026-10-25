import assert from 'node:assert/strict';
import { test } from 'node:test';
import { defineConfig, normalizePath, problems, resolve, type Config, type Experiment } from '../src/index.ts';

const valid: Config = {
  analytics: { posthog: { key: 'phc_test' } },
  experiments: [{ flag: 'landing', path: '/', variants: { b: '/variants/landing/b/' }, goal: 'signup', status: 'running' }],
};

const plan = { goal: 'signup', status: 'draft' } as const;

test('a valid configuration has no problems', () => {
  assert.deepEqual(problems(valid), []);
  assert.equal(defineConfig(valid), valid);
});

test('problems are all reported at once', () => {
  const found = problems({
    analytics: { posthog: { key: '' } },
    experiments: [
      { flag: 'Bad Flag', path: 'pricing', variants: { control: '/x/' }, ...plan },
      { flag: 'twice', path: '/a/', variants: { b: '/a' }, ...plan },
      { flag: 'twice', path: '/a', variants: {}, ...plan },
      { flag: 'unplanned', path: '/u', variants: { b: '/u/b' }, goal: 'Sign Up', status: 'paused' } as unknown as Experiment,
    ],
  });
  assert.equal(found.length, 10, found.join('\n'));
  assert.throws(() => defineConfig({ analytics: { posthog: { key: '' } } }), /key is missing/);
});

test('paths are compared without trailing slashes or index.html', () => {
  assert.equal(normalizePath('/'), '/');
  assert.equal(normalizePath('/index.html'), '/');
  assert.equal(normalizePath('/pricing/'), '/pricing');
  assert.equal(normalizePath('/pricing/index.html'), '/pricing');
});

test('resolving fills in the default host and normalizes paths', () => {
  const m = resolve({ ...valid, experiments: [{ flag: 'p', path: '/pricing/', variants: { b: '/v/b/' }, ...plan }] });
  assert.equal(m.analytics.posthog.host, 'https://us.i.posthog.com');
  assert.equal(m.experiments[0].path, '/pricing');
  assert.deepEqual(m.experiments[0].variants, { b: '/v/b/' });
  assert.equal(m.experiments[0].status, 'draft');
});

test('a split names the control and every variant, in whole percentages summing to 100', () => {
  const at = (split: Record<string, number>) => problems({ ...valid, experiments: [{ ...valid.experiments![0], split }] });
  assert.deepEqual(at({ control: 70, b: 30 }), []);
  assert.match(at({ control: 100 })[0], /split must name exactly control, b/);
  assert.match(at({ control: 60, b: 30 })[0], /summing to 100/);
  assert.match(at({ control: 50.5, b: 49.5 })[0], /whole percentages/);
});

test('an even split gives the remainder to the first variants', () => {
  const three = resolve({ ...valid, experiments: [{ ...valid.experiments![0], variants: { b: '/b/', c: '/c/' } }] });
  assert.deepEqual(three.experiments[0].split, { control: 34, b: 33, c: 33 });
});

test('the project id is a positive whole number, and the app host follows the ingestion host', () => {
  assert.match(problems({ ...valid, analytics: { posthog: { key: 'k', project: 0 } } })[0], /numeric id/);
  const eu = resolve({ ...valid, analytics: { posthog: { key: 'k', host: 'https://eu.i.posthog.com', project: 7 } } });
  assert.equal(eu.analytics.posthog.app, 'https://eu.posthog.com');
  assert.equal(eu.analytics.posthog.project, 7);
});
