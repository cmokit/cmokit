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

  const into = await create(join(root, 'My Site'), template);
  assert.equal(JSON.parse(await readFile(join(into, 'package.json'), 'utf8')).name, 'my-site');
  assert.equal(await readFile(join(into, '.gitignore'), 'utf8'), 'dist/\n');
  await assert.rejects(stat(join(into, 'node_modules')));
  await assert.rejects(create(into, template), /is not empty/);
});
