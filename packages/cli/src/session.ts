// What the command line and the MCP server share: opening the configuration and the experiments
// tool, and describing what the tool answers in words (ADR-0013). The tool's administrative key is
// read here, from the environment, and goes nowhere but the tool.

import { resolve as resolvePath } from 'node:path';
import { pathToFileURL } from 'node:url';
import { defineConfig, resolve, type Config, type Resolved } from './index.ts';
import type { ExperimentsAdmin, Plan, Planned, Report } from './experiments.ts';
import { posthogAdmin } from './posthog.ts';

export const KEY_VARIABLE = 'POSTHOG_PERSONAL_API_KEY';
export const CONFIG_FILE = 'cmokit.config.ts';

export interface Io {
  env: Record<string, string | undefined>;
  /** Loads the configuration file's default export. */
  load?(file: string): Promise<Config>;
  fetch?: typeof fetch;
}

/** Reads the configuration and opens the experiments tool it names. */
export async function connect(file: string, io: Io): Promise<{ config: Resolved; admin: ExperimentsAdmin }> {
  const config = resolve(defineConfig(await (io.load ?? load)(file)));
  const { app, project } = config.analytics.posthog;
  if (project === undefined) throw new Error('analytics.posthog.project is missing from the configuration');
  const key = io.env[KEY_VARIABLE];
  if (!key) throw new Error(`${KEY_VARIABLE} is not set`);
  return { config, admin: posthogAdmin({ app, project, key, fetch: io.fetch }) };
}

export function describeSync({ steps, problems }: Plan, dryRun: boolean): string[] {
  if (problems.length > 0) return [...problems.map((p) => `problem: ${p}`), 'Nothing was changed.'];
  if (steps.length === 0) return ['The experiments tool already matches the configuration.'];
  return steps.map((step) => `${dryRun ? 'would ' : ''}${step.action} ${step.flag}`);
}

export function describePlans(found: Planned[]): string[] {
  return found.length === 0 ? ['No experiment is a draft or running.'] : found.flatMap(describeEstimate);
}

export function describeReports(found: Report[]): string[] {
  return found.length === 0 ? ['The configuration has no experiments.'] : found.flatMap(describeReport);
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
  // A fresh address each time, so a long-running MCP server reads the file as it is now.
  const url = `${pathToFileURL(resolvePath(file)).href}?at=${Date.now()}`;
  const module = (await import(url)) as { default?: Config };
  if (!module.default) throw new Error(`${file} has no default export`);
  return module.default;
}
