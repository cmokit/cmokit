import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { test } from 'node:test';
import type { Config } from '@cmokit/cli';
import cmokit from '../src/index.ts';

const config: Config = {
  analytics: { posthog: { key: 'phc_test', host: 'https://eu.i.posthog.com' } },
  experiments: [
    { flag: 'landing', path: '/', variants: { b: '/variants/landing/b/' }, goal: 'signup', status: 'running' },
    { flag: 'pricing', path: '/pricing/', variants: { b: '/variants/pricing/b/' }, goal: 'signup', status: 'draft' },
    { flag: 'old', path: '/old/', variants: { b: '/variants/old/b/' }, goal: 'signup', status: 'ended' },
  ],
};

const BUILT = ['', 'variants/landing/b/', 'pricing/', 'variants/pricing/b/'].map((pathname) => ({ pathname }));

// The hooks are called with only the arguments the integration uses.
type Hook = (args: Record<string, unknown>) => Promise<void> | void;
const hook = (name: string) => (cmokit(config).hooks as Record<string, Hook>)[name];

test('the page script knows only running experiments, relays through the edge in a build and goes direct in dev', () => {
  for (const [command, apiHost, convert] of [['build', '/_cmokit/a', '/_cmokit/convert'], ['dev', 'https://eu.i.posthog.com', 'browser']]) {
    const scripts: string[] = [];
    hook('astro:config:setup')({ command, config: { root: new URL('file:///site/') }, injectScript: (_stage: string, code: string) => scripts.push(code) });
    const options = JSON.parse(scripts[0].slice(scripts[0].indexOf('start(') + 6, -2));
    assert.deepEqual(options, { key: 'phc_test', apiHost, uiHost: 'https://eu.posthog.com', flags: ['landing'], convert });
  }
});

test('the build passes when every draft and running experiment\'s pages were built', async () => {
  await hook('astro:build:done')({ pages: BUILT });
});

test('the build fails when a draft or running experiment\'s page was not built', async () => {
  for (const missing of ['variants/landing/b/', 'variants/pricing/b/']) {
    await assert.rejects(
      async () => hook('astro:build:done')({ pages: BUILT.filter((p) => p.pathname !== missing) }),
      new RegExp(`no page was built at /${missing}`),
    );
  }
});

test('an invalid configuration fails when the integration is created', () => {
  assert.throws(() => cmokit({ analytics: { posthog: { key: '' } } }), /key is missing/);
});

test('the build fails when a sequence\'s message has no template, or one without a subject', async () => {
  const root = mkdtempSync(join(tmpdir(), 'cmokit-site-'));
  mkdirSync(join(root, 'messages'));
  writeFileSync(join(root, 'messages', 'welcome.md'), '---\nsubject: Hi\n---\nBody');
  writeFileSync(join(root, 'messages', 'later.md'), 'no front matter');
  const withSequence = (templates: string[]) => {
    const hooks = cmokit({
      ...config,
      messaging: { from: 'hello@site.example', address: '1 Main St', sendgrid: { unsubscribeGroup: 1 } },
      sequences: [{ name: 'welcome', start: 'signup', messages: templates.map((template) => ({ template, after: '1d' })) }],
    }).hooks as Record<string, Hook>;
    hooks['astro:config:setup']({ command: 'build', config: { root: pathToFileURL(`${root}/`) }, injectScript: () => {} });
    return hooks['astro:build:done']({ pages: BUILT });
  };
  await withSequence(['welcome']);
  await assert.rejects(async () => withSequence(['welcome', 'later', 'gone']), (error: Error) => {
    assert.match(error.message, /messages\/later\.md needs front matter/);
    assert.match(error.message, /sequence "welcome": no template messages\/gone\.md/);
    return true;
  });
});
