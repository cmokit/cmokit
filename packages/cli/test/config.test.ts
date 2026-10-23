import assert from 'node:assert/strict';
import { test } from 'node:test';
import { defineConfig, manifest, normalizePath, problems, type Config } from '../src/index.ts';

const valid: Config = {
  analytics: { posthog: { key: 'phc_test' } },
  experiments: [{ flag: 'landing', path: '/', variants: { b: '/variants/landing/b/' } }],
};

test('a valid configuration has no problems', () => {
  assert.deepEqual(problems(valid), []);
  assert.equal(defineConfig(valid), valid);
});

test('problems are all reported at once', () => {
  const found = problems({
    analytics: { posthog: { key: '' } },
    experiments: [
      { flag: 'Bad Flag', path: 'pricing', variants: { control: '/x/' } },
      { flag: 'twice', path: '/a/', variants: { b: '/a' } },
      { flag: 'twice', path: '/a', variants: {} },
    ],
  });
  assert.equal(found.length, 8, found.join('\n'));
  assert.throws(() => defineConfig({ analytics: { posthog: { key: '' } } }), /key is missing/);
});

test('paths are compared without trailing slashes or index.html', () => {
  assert.equal(normalizePath('/'), '/');
  assert.equal(normalizePath('/index.html'), '/');
  assert.equal(normalizePath('/pricing/'), '/pricing');
  assert.equal(normalizePath('/pricing/index.html'), '/pricing');
});

test('the manifest fills in the default host and normalizes paths', () => {
  const m = manifest({ ...valid, experiments: [{ flag: 'p', path: '/pricing/', variants: { b: '/v/b/' } }] });
  assert.equal(m.analytics.posthog.host, 'https://us.i.posthog.com');
  assert.equal(m.experiments[0].path, '/pricing');
  assert.deepEqual(m.experiments[0].variants, { b: '/v/b/' });
});
