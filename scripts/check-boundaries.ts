// Checks the package boundaries of ADR-0003 and ADR-0010: the edge depends, directly or through
// another package, on neither the lifecycle nor a database client, and the edge handler names no
// bought tool; only its adapters and the Worker that wires them do. Run with `npm run check:boundaries`.

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const packages = join(root, 'packages');

const FORBIDDEN_FOR_EDGE = ['@cmokit/lifecycle', 'pg', 'postgres', '@electric-sql/pglite', 'kysely', 'drizzle-orm', '@prisma/client'];
const EDGE_WIRING = ['posthog.ts', 'worker.ts'];
const TOOLS = /posthog|growthbook|statsig|cloudflare/i;

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

const edgeSource = join(packages, 'edge', 'src');
for (const file of readdirSync(edgeSource)) {
  if (!file.endsWith('.ts') || EDGE_WIRING.includes(file)) continue;
  if (TOOLS.test(readFileSync(join(edgeSource, file), 'utf8'))) errors.push(`packages/edge/src/${file} names a bought tool`);
}

if (errors.length > 0) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log('Package boundaries hold.');
