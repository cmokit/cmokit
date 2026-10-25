// The `cmokit` command. `cmokit experiments sync` makes the experiments tool match the configuration,
// and is run by the deploy after the edge is deployed (ADR-0013).

import { resolve as resolvePath } from 'node:path';
import { pathToFileURL } from 'node:url';
import { defineConfig, resolve, type Config } from './index.ts';
import { sync } from './experiments.ts';
import { posthogAdmin } from './posthog.ts';

export const KEY_VARIABLE = 'POSTHOG_PERSONAL_API_KEY';

const USAGE = `Usage: cmokit experiments sync [--dry-run] [--config <file>]

  Makes PostHog's experiments match cmokit.config.ts. Reads the personal API key from ${KEY_VARIABLE}.
  --dry-run   Print what would change, and change nothing.
  --config    The configuration file. Defaults to cmokit.config.ts.`;

export interface CommandIo {
  env: Record<string, string | undefined>;
  out(line: string): void;
  /** Loads the configuration file's default export. */
  load?(file: string): Promise<Config>;
  fetch?: typeof fetch;
}

/** Runs the command and returns its exit code. */
export async function run(args: string[], io: CommandIo): Promise<number> {
  const [group, command, ...rest] = args;
  if (group !== 'experiments' || command !== 'sync') {
    io.out(USAGE);
    return group === undefined || group === '--help' ? 0 : 2;
  }
  const dryRun = rest.includes('--dry-run');
  const at = rest.indexOf('--config');
  const file = at >= 0 ? rest[at + 1] : 'cmokit.config.ts';
  if (!file || rest.some((a, i) => a.startsWith('--') && a !== '--dry-run' && a !== '--config' && i !== at + 1)) {
    io.out(USAGE);
    return 2;
  }

  try {
    const config = resolve(defineConfig(await (io.load ?? load)(file)));
    const { app, project } = config.analytics.posthog;
    if (project === undefined) throw new Error('analytics.posthog.project is missing from the configuration');
    const key = io.env[KEY_VARIABLE];
    if (!key) throw new Error(`${KEY_VARIABLE} is not set`);

    const plan = await sync(config, posthogAdmin({ app, project, key, fetch: io.fetch }), { dryRun });
    for (const problem of plan.problems) io.out(`problem: ${problem}`);
    if (plan.problems.length > 0) {
      io.out('Nothing was changed.');
      return 1;
    }
    if (plan.steps.length === 0) io.out('The experiments tool already matches the configuration.');
    for (const step of plan.steps) io.out(`${dryRun ? 'would ' : ''}${step.action} ${step.flag}`);
    return 0;
  } catch (error) {
    io.out(`cmokit: ${(error as Error).message}`);
    return 1;
  }
}

async function load(file: string): Promise<Config> {
  const module = (await import(pathToFileURL(resolvePath(file)).href)) as { default?: Config };
  if (!module.default) throw new Error(`${file} has no default export`);
  return module.default;
}
