// The `cmokit` command (ADR-0013). `cmokit experiments sync` makes the experiments tool match the
// configuration, and is run by the deploy after the edge is deployed. `plan` estimates how long each
// experiment must run, and `results` reads each one's results, as the tool computes them.

import { resolve as resolvePath } from 'node:path';
import { pathToFileURL } from 'node:url';
import { defineConfig, resolve, type Config } from './index.ts';
import { estimate, results, sync, type Planned, type Report } from './experiments.ts';
import { posthogAdmin } from './posthog.ts';

export const KEY_VARIABLE = 'POSTHOG_PERSONAL_API_KEY';

const USAGE = `Usage: cmokit experiments sync [--dry-run] [--config <file>]
       cmokit experiments plan [<flag>] [--effect <percent>] [--json] [--config <file>]
       cmokit experiments results [<flag>] [--json] [--config <file>]

  sync      Makes PostHog's experiments match cmokit.config.ts.
  plan      Estimates how long each experiment not ended must run, from its page's recent traffic
            and its goal's conversion rate there.
  results   Reads each experiment's results on its goal, as PostHog computes them.

  --dry-run   Print what would change, and change nothing.
  --effect    The smallest relative lift to detect, in percent. Defaults to the project's default.
  --json      Print JSON instead of text.
  --config    The configuration file. Defaults to cmokit.config.ts.

  Reads PostHog's personal API key from ${KEY_VARIABLE}.`;

export interface CommandIo {
  env: Record<string, string | undefined>;
  out(line: string): void;
  /** Loads the configuration file's default export. */
  load?(file: string): Promise<Config>;
  fetch?: typeof fetch;
}

interface Parsed {
  command: 'sync' | 'plan' | 'results';
  file: string;
  only?: string;
  dryRun: boolean;
  json: boolean;
  effect?: number;
}

const ALLOWED: Record<Parsed['command'], string[]> = {
  sync: ['--dry-run', '--config'],
  plan: ['--effect', '--json', '--config'],
  results: ['--json', '--config'],
};

function parse(args: string[]): Parsed | undefined {
  const [group, command, ...rest] = args;
  if (group !== 'experiments' || !(command === 'sync' || command === 'plan' || command === 'results')) return undefined;
  const parsed: Parsed = { command, file: 'cmokit.config.ts', dryRun: false, json: false };
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    if (arg.startsWith('--') && !ALLOWED[command].includes(arg)) return undefined;
    if (arg === '--dry-run') parsed.dryRun = true;
    else if (arg === '--json') parsed.json = true;
    else if (arg === '--config' || arg === '--effect') {
      const value = rest[++i];
      if (value === undefined) return undefined;
      if (arg === '--config') parsed.file = value;
      else {
        parsed.effect = Number(value);
        if (!(parsed.effect > 0)) return undefined;
      }
    } else if (command !== 'sync' && parsed.only === undefined) parsed.only = arg;
    else return undefined;
  }
  return parsed;
}

/** Runs the command and returns its exit code. */
export async function run(args: string[], io: CommandIo): Promise<number> {
  const parsed = parse(args);
  if (!parsed) {
    io.out(USAGE);
    return args[0] === undefined || args[0] === '--help' ? 0 : 2;
  }

  try {
    const config = resolve(defineConfig(await (io.load ?? load)(parsed.file)));
    const { app, project } = config.analytics.posthog;
    if (project === undefined) throw new Error('analytics.posthog.project is missing from the configuration');
    const key = io.env[KEY_VARIABLE];
    if (!key) throw new Error(`${KEY_VARIABLE} is not set`);
    const admin = posthogAdmin({ app, project, key, fetch: io.fetch });

    if (parsed.command === 'plan') {
      const found = await estimate(config, admin, { only: parsed.only, effect: parsed.effect });
      if (parsed.json) io.out(JSON.stringify(found, null, 2));
      else if (found.length === 0) io.out('No experiment is a draft or running.');
      else for (const e of found) for (const line of describeEstimate(e)) io.out(line);
      return 0;
    }
    if (parsed.command === 'results') {
      const found = await results(config, admin, { only: parsed.only });
      if (parsed.json) io.out(JSON.stringify(found, null, 2));
      else if (found.length === 0) io.out('The configuration has no experiments.');
      else for (const report of found) for (const line of describeReport(report)) io.out(line);
      return 0;
    }

    const plan = await sync(config, admin, { dryRun: parsed.dryRun });
    for (const problem of plan.problems) io.out(`problem: ${problem}`);
    if (plan.problems.length > 0) {
      io.out('Nothing was changed.');
      return 1;
    }
    if (plan.steps.length === 0) io.out('The experiments tool already matches the configuration.');
    for (const step of plan.steps) io.out(`${parsed.dryRun ? 'would ' : ''}${step.action} ${step.flag}`);
    return 0;
  } catch (error) {
    io.out(`cmokit: ${(error as Error).message}`);
    return 1;
  }
}

const count = (n: number) => Math.round(n).toLocaleString('en-US');
const percent = (fraction: number, digits = 1) => `${(fraction * 100).toFixed(digits)}%`;
const signed = (fraction: number) => `${fraction >= 0 ? '+' : ''}${(fraction * 100).toFixed(0)}%`;

function describeEstimate({ flag, path, goal, variants, estimate: e }: Planned): string[] {
  const head = `${flag}, on ${path}:`;
  const window = `the last ${e.windowDays} days`;
  if (e.reached === 0) return [`${head} no visitor reached the page in ${window}, so there is no baseline to plan from.`];
  const traffic = `${count(e.reached / e.windowDays)} visitors a day over ${window}`;
  if (e.converted === 0) return [`${head} ${traffic}, none of whom sent ${goal}, so there is no baseline to plan from.`];
  const lines = [`${head} ${traffic}, ${percent(e.converted / e.reached)} of whom sent ${goal}.`];
  if (e.sampleSize === undefined) lines.push(`  PostHog could not size an experiment to detect a ${e.effect}% lift.`);
  else {
    const time = e.days === undefined ? '' : `: about ${count(e.days)} days`;
    lines.push(`  Detecting a ${e.effect}% lift needs ${count(e.sampleSize)} visitors across ${variants} variants${time}.`);
  }
  return lines;
}

function describeReport(r: Report): string[] {
  const head = `${r.flag}, on ${r.path}:`;
  if (r.state === 'draft' || !r.results) return [`${head} not started.`];
  const since = r.started ? ` since ${r.started.slice(0, 10)}` : '';
  const state = r.state === 'ended' ? `ended${r.ended ? ` ${r.ended.slice(0, 10)}` : ''}` : `running${since}`;
  if ('waiting' in r.results) return [`${head} ${state}. No results yet: ${r.results.waiting}`];
  const width = Math.max(...r.results.variants.map((v) => v.key.length));
  const lines = [`${head} ${state}, judged ${r.results.method === 'bayesian' ? 'by Bayesian' : 'by frequentist'} statistics.`];
  for (const v of r.results.variants) {
    const rate = v.exposed > 0 ? ` (${percent(v.converted / v.exposed)})` : '';
    let line = `  ${v.key.padEnd(width)}  ${count(v.exposed)} exposed, ${count(v.converted)} converted${rate}`;
    const verdict: string[] = [];
    if (v.interval) verdict.push(`lift ${signed(v.interval[0])} to ${signed(v.interval[1])}`);
    if (v.chanceToWin !== undefined) verdict.push(`chance to win ${percent(v.chanceToWin, 0)}`);
    if (v.pValue !== undefined) verdict.push(`p = ${v.pValue.toFixed(3)}`);
    if (v.significant !== undefined) verdict.push(v.significant ? 'significant' : 'not significant yet');
    if (verdict.length > 0) line += `: ${verdict.join(', ')}`;
    lines.push(line);
  }
  return lines;
}

async function load(file: string): Promise<Config> {
  const module = (await import(pathToFileURL(resolvePath(file)).href)) as { default?: Config };
  if (!module.default) throw new Error(`${file} has no default export`);
  return module.default;
}
