#!/usr/bin/env node
// `npm create cmokit <directory>`: copies the starter site into a new directory.

import { realpathSync } from 'node:fs';
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

  // The Workers are named for the site, and the edge's binding names the lifecycle Worker.
  for (const file of ['wrangler.jsonc', join('lifecycle', 'wrangler.jsonc')]) {
    const path = join(into, file);
    const text = await readFile(path, 'utf8').catch(() => undefined);
    if (text !== undefined) await writeFile(path, text.replaceAll('"cmokit-site-', `"${manifest.name}-`));
  }
  return into;
}

// npm runs the command through a symlink in node_modules/.bin, so compare real paths.
if (process.argv[1] && realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1])) {
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
