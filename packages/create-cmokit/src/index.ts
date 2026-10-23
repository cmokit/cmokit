#!/usr/bin/env node
// `npm create cmokit <directory>`: copies the starter site into a new directory.

import { cp, readFile, readdir, rename, writeFile } from 'node:fs/promises';
import { basename, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const SKIP = new Set(['node_modules', 'dist', '.astro', '.wrangler']);

export async function create(target: string, template = fileURLToPath(new URL('../template', import.meta.url))) {
  const into = resolve(target);
  const existing = await readdir(into).catch(() => []);
  if (existing.length > 0) throw new Error(`${into} is not empty`);

  await cp(template, into, {
    recursive: true,
    filter: (source) => !relative(template, source).split(sep).some((part) => SKIP.has(part)),
  });
  await rename(join(into, '_gitignore'), join(into, '.gitignore'));

  const manifestPath = join(into, 'package.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  manifest.name = basename(into).toLowerCase().replace(/[^a-z0-9-]+/g, '-');
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  return into;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const target = process.argv[2];
  if (!target) {
    console.error('Usage: npm create cmokit <directory>');
    process.exit(1);
  }
  create(target).then(
    (into) => console.log(`Created ${into}.\nNext: cd ${target} && npm install && npm run dev`),
    (error: Error) => {
      console.error(error.message);
      process.exit(1);
    },
  );
}
