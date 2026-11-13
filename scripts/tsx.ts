// Lets the tests import the TSX under packages/content/apps/ (ADR-0049, ADR-0051): Node runs
// TypeScript by stripping types, which leaves JSX alone, so this hook has esbuild compile a .tsx
// file as it loads, with React's automatic runtime. Loaded by `npm test` with --import.
import { registerHooks } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { transformSync } from 'esbuild';

registerHooks({
  load(url, context, nextLoad) {
    if (!url.startsWith('file:') || !url.endsWith('.tsx')) return nextLoad(url, context);
    const path = fileURLToPath(url);
    const { code } = transformSync(readFileSync(path, 'utf8'), { loader: 'tsx', jsx: 'automatic', format: 'esm', sourcefile: path, sourcemap: 'inline' });
    return { format: 'module', source: code, shortCircuit: true };
  },
});
