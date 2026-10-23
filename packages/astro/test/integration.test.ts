import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { test } from 'node:test';
import type { Config } from '@cmokit/cli';
import cmokit from '../src/index.ts';

const config: Config = {
  analytics: { posthog: { key: 'phc_test', host: 'https://eu.i.posthog.com' } },
  experiments: [{ flag: 'landing', path: '/', variants: { b: '/variants/landing/b/' } }],
};

const logger = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} };

// The hooks are called with only the arguments the integration uses.
type Hook = (args: Record<string, unknown>) => Promise<void> | void;
const hook = (name: string) => (cmokit(config).hooks as Record<string, Hook>)[name];

test('the page script relays through the edge in a build and goes direct in dev', () => {
  for (const [command, apiHost, convert] of [['build', '/_cmokit/a', '/_cmokit/convert'], ['dev', 'https://eu.i.posthog.com', 'browser']]) {
    const scripts: string[] = [];
    hook('astro:config:setup')({ command, injectScript: (_stage: string, code: string) => scripts.push(code) });
    const options = JSON.parse(scripts[0].slice(scripts[0].indexOf('start(') + 6, -2));
    assert.deepEqual(options, { key: 'phc_test', apiHost, uiHost: 'https://eu.posthog.com', flags: ['landing'], convert });
  }
});

test('the build publishes the manifest', async () => {
  const dir = pathToFileURL(`${await mkdtemp(join(tmpdir(), 'cmokit-'))}/`);
  await hook('astro:build:done')({ dir, logger, pages: [{ pathname: '' }, { pathname: 'variants/landing/b/' }] });
  const site = JSON.parse(await readFile(new URL('_cmokit/site.json', dir), 'utf8'));
  assert.equal(site.version, 1);
  assert.equal(site.experiments[0].flag, 'landing');
});

test('the build fails when a variant page was not built', async () => {
  const dir = pathToFileURL(`${await mkdtemp(join(tmpdir(), 'cmokit-'))}/`);
  await assert.rejects(
    async () => hook('astro:build:done')({ dir, logger, pages: [{ pathname: '' }] }),
    /no page was built at \/variants\/landing\/b\//,
  );
});

test('an invalid configuration fails when the integration is created', () => {
  assert.throws(() => cmokit({ analytics: { posthog: { key: '' } } }), /key is missing/);
});
