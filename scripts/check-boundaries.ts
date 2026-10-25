// Checks the package boundaries of ADR-0003, ADR-0010, ADR-0013 and ADR-0015: the edge depends,
// directly or through another package, on neither the lifecycle nor a database client; no package
// depends on a database client; the edge's and the lifecycle's handlers name no bought tool, only
// their adapters and the Workers that wire them do; and the edge reaches nothing of
// the command line's but its configuration, so it never holds the experiments tool's administrative
// key. Run with `npm run check:boundaries`.

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const packages = join(root, 'packages');

const FORBIDDEN_FOR_EDGE = ['@cmokit/lifecycle', 'pg', 'postgres', '@electric-sql/pglite', 'kysely', 'drizzle-orm', '@prisma/client'];
const DATABASE_CLIENTS = FORBIDDEN_FOR_EDGE.slice(1);
const WIRING = ['posthog.ts', 'sendgrid.ts', 'worker.ts'];
const TOOLS = /posthog|growthbook|statsig|cloudflare|sendgrid|twilio|customer\.io/i;

const errors: string[] = [];

function dependencies(name: string): string[] {
  const dir = readdirSync(packages).map((d) => join(packages, d)).find((d) => {
    const manifest = join(d, 'package.json');
    return existsSync(manifest) && JSON.parse(readFileSync(manifest, 'utf8')).name === name;
  });
  if (!dir) return [];
  const manifest = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
  return Object.keys({ ...manifest.dependencies, ...manifest.peerDependencies });
}

const seen = new Set<string>();
const queue = ['@cmokit/edge'];
while (queue.length > 0) {
  const name = queue.shift()!;
  for (const dep of dependencies(name)) {
    if (FORBIDDEN_FOR_EDGE.includes(dep)) errors.push(`@cmokit/edge depends on ${dep} through ${name}`);
    if (!seen.has(dep)) {
      seen.add(dep);
      queue.push(dep);
    }
  }
}

for (const dir of readdirSync(packages)) {
  for (const dep of dependencies(JSON.parse(readFileSync(join(packages, dir, 'package.json'), 'utf8')).name)) {
    if (DATABASE_CLIENTS.includes(dep)) errors.push(`packages/${dir} depends on the database client ${dep}`);
  }
}

const edgeSource = join(packages, 'edge', 'src');
for (const pkg of ['edge', 'lifecycle']) {
  const source = join(packages, pkg, 'src');
  for (const file of readdirSync(source)) {
    if (!file.endsWith('.ts') || WIRING.includes(file)) continue;
    if (TOOLS.test(readFileSync(join(source, file), 'utf8'))) errors.push(`packages/${pkg}/src/${file} names a bought tool`);
  }
}

// The edge imports `@cmokit/cli` only by its main entry, and that entry imports nothing local.
for (const file of readdirSync(edgeSource).filter((f) => f.endsWith('.ts'))) {
  for (const [, specifier] of readFileSync(join(edgeSource, file), 'utf8').matchAll(/from '(@cmokit\/cli[^']*)'/g)) {
    if (specifier !== '@cmokit/cli') errors.push(`packages/edge/src/${file} imports ${specifier}`);
  }
}
const cliEntry = readFileSync(join(packages, 'cli', 'src', 'index.ts'), 'utf8');
if (/from '\.\//.test(cliEntry)) errors.push('packages/cli/src/index.ts imports a module of its own, which the edge would bundle');

if (errors.length > 0) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log('Package boundaries hold.');
