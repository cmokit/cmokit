import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { create } from '../src/index.ts';

test('the starter is copied, named for its directory, without build output', async () => {
  const root = await mkdtemp(join(tmpdir(), 'cmokit-'));
  const template = join(root, 'template');
  await mkdir(join(template, 'node_modules', 'x'), { recursive: true });
  await writeFile(join(template, 'package.json'), '{"name":"cmokit-site"}');
  await writeFile(join(template, '_gitignore'), 'dist/\n');
  await mkdir(join(template, 'lifecycle'));
  await writeFile(join(template, 'wrangler.jsonc'), '{ "name": "cmokit-site-edge", "services": [{ "service": "cmokit-site-lifecycle" }] }');
  await writeFile(join(template, 'lifecycle', 'wrangler.jsonc'), '{ "name": "cmokit-site-lifecycle" }');

  const into = await create(join(root, 'My Site'), template);
  assert.equal(JSON.parse(await readFile(join(into, 'package.json'), 'utf8')).name, 'my-site');
  assert.equal(await readFile(join(into, '.gitignore'), 'utf8'), 'dist/\n');
  assert.equal(await readFile(join(into, 'wrangler.jsonc'), 'utf8'), '{ "name": "my-site-edge", "services": [{ "service": "my-site-lifecycle" }] }');
  assert.equal(await readFile(join(into, 'lifecycle', 'wrangler.jsonc'), 'utf8'), '{ "name": "my-site-lifecycle" }');
  await assert.rejects(stat(join(into, 'node_modules')));
  await assert.rejects(create(into, template), /is not empty/);
});
