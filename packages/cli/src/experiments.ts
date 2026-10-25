// Makes the experiments tool match the configuration (ADR-0013). The plan is worked out first, from
// the configuration and what the tool holds, and nothing is changed if any experiment cannot be made
// to match. Only experiments the sync created are changed. Names no tool: the tool is reached through
// `ExperimentsAdmin`, which an adapter implements.

import type { Resolved } from './index.ts';

export type ToolState = 'draft' | 'running' | 'ended';

/** An experiment as the tool holds it, archived ones left out. */
export interface ToolExperiment {
  id: string;
  flag: string;
  /** True when CMOkit's sync created it, so the sync may change it. */
  managed: boolean;
  state: ToolState;
  /** Each variant's percentage, `control` included. */
  split: Record<string, number>;
  goal: string | undefined;
  /** When it was launched, as an ISO date. */
  started?: string;
  /** When it ended, as an ISO date. */
  ended?: string;
}

/** What the sync asks the tool to hold for an experiment. */
export interface Declared {
  flag: string;
  path: string;
  goal: string;
  split: Record<string, number>;
}

/** How long an experiment must run, from the page's recent traffic and the goal's baseline. */
export interface Estimate {
  /** The days of traffic read, ending now. */
  windowDays: number;
  /** Visitors who reached the page in the window. */
  reached: number;
  /** Those of them who then sent the goal event. */
  converted: number;
  /** The smallest relative lift to detect, as a percentage. */
  effect: number;
  /** Visitors needed across every variant. Absent when there is no baseline to start from. */
  sampleSize?: number;
  /** Days to reach `sampleSize` at the window's traffic, given the split. */
  days?: number;
}

export interface VariantResult {
  key: string;
  /** Visitors exposed to the variant. */
  exposed: number;
  /** Those of them who then sent the goal event. */
  converted: number;
  /** For a variant other than the control: its lift over the control, as a 95% interval of fractions. */
  interval?: [number, number];
  /** Bayesian: the probability the variant beats the control. */
  chanceToWin?: number;
  /** Frequentist: the p-value of its difference from the control. */
  pValue?: number;
  /** Whether the tool judges the difference from the control decisive. */
  significant?: boolean;
}

/** An experiment's results on its goal, as the tool computes them, or why there are none yet. */
export type Results =
  | { method: 'bayesian' | 'frequentist'; variants: VariantResult[] }
  | { waiting: string };

/** The administrative half of the experiments interface. */
export interface ExperimentsAdmin {
  /** Every experiment not archived. */
  list(): Promise<ToolExperiment[]>;
  /** Creates a draft, with its flag, and returns its id. */
  create(experiment: Declared): Promise<string>;
  /** Changes a draft's split and goal. */
  update(id: string, experiment: Declared): Promise<void>;
  launch(id: string): Promise<void>;
  end(id: string): Promise<void>;
  /** Archives an ended experiment and turns off its flag. */
  archive(id: string): Promise<void>;
  /** Deletes a draft and its flag. */
  remove(id: string): Promise<void>;
  /** Estimates the running time to detect `effect`, a relative lift in percent; the tool's default if absent. */
  estimate(experiment: Declared, effect?: number): Promise<Estimate>;
  /** Reads a launched experiment's results on its goal. */
  results(id: string, experiment: Declared): Promise<Results>;
}

export type Action = 'create' | 'update' | 'launch' | 'end' | 'archive' | 'remove';

export interface Step {
  action: Action;
  flag: string;
}

export interface Plan {
  steps: Step[];
  /** Why an experiment cannot be made to match. A plan with problems is not applied. */
  problems: string[];
}

export function plan(config: Resolved, held: ToolExperiment[]): Plan {
  const steps: Step[] = [];
  const problems: string[] = [];
  const step = (action: Action, flag: string) => steps.push({ action, flag });

  for (const e of config.experiments) {
    const where = `experiment "${e.flag}"`;
    const same = held.filter((h) => h.flag === e.flag);
    if (same.some((h) => !h.managed)) {
      problems.push(`${where}: the tool holds an experiment on this flag that CMOkit did not create; use another flag`);
      continue;
    }
    if (same.length > 1) {
      problems.push(`${where}: the tool holds ${same.length} experiments on this flag; archive all but one in the tool`);
      continue;
    }
    const h = same[0];
    const drifted = h !== undefined && (h.goal !== e.goal || !sameSplit(h.split, e.split));

    if (!h) {
      if (e.status === 'ended') continue;
      step('create', e.flag);
      if (e.status === 'running') step('launch', e.flag);
    } else if (h.state === 'draft') {
      if (e.status === 'ended') {
        step('remove', e.flag);
        continue;
      }
      if (drifted) step('update', e.flag);
      if (e.status === 'running') step('launch', e.flag);
    } else if (h.state === 'running') {
      if (e.status === 'draft') problems.push(`${where}: is already running, and cannot return to draft`);
      else if (drifted) problems.push(`${where}: its variants, split or goal cannot change while it runs; end it and start a new one under a new flag`);
      else if (e.status === 'ended') step('end', e.flag);
    } else if (e.status !== 'ended') {
      problems.push(`${where}: has ended, and cannot start again; start a new one under a new flag`);
    }
  }

  const declared = new Set(config.experiments.map((e) => e.flag));
  for (const h of held) {
    if (!h.managed || declared.has(h.flag)) continue;
    if (h.state === 'draft') step('remove', h.flag);
    else {
      if (h.state === 'running') step('end', h.flag);
      step('archive', h.flag);
    }
  }
  return { steps, problems };
}

/** Applies a plan's steps in order. Refuses a plan with problems. */
export async function apply(
  config: Resolved,
  held: ToolExperiment[],
  { steps, problems }: Plan,
  admin: ExperimentsAdmin,
): Promise<void> {
  if (problems.length > 0) throw new Error(`The experiments tool was not changed:\n  ${problems.join('\n  ')}`);
  const ids = new Map(held.map((h) => [h.flag, h.id]));
  const declared = new Map(config.experiments.map((e) => [e.flag, declaration(e)]));
  for (const { action, flag } of steps) {
    if (action === 'create') {
      ids.set(flag, await admin.create(declared.get(flag)!));
      continue;
    }
    const id = ids.get(flag)!;
    if (action === 'update') await admin.update(id, declared.get(flag)!);
    else await admin[action](id);
  }
}

/** Reads what the tool holds, plans, and applies unless `dryRun`. Returns the plan. */
export async function sync(config: Resolved, admin: ExperimentsAdmin, { dryRun = false } = {}): Promise<Plan> {
  const held = await admin.list();
  const planned = plan(config, held);
  if (!dryRun) await apply(config, held, planned, admin);
  return planned;
}

export function declaration(e: Resolved['experiments'][number]): Declared {
  return { flag: e.flag, path: e.path, goal: e.goal, split: e.split };
}

function sameSplit(a: Record<string, number>, b: Record<string, number>): boolean {
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every((k) => a[k] === b[k]);
}

export interface PlanOptions {
  /** Only this experiment's flag; every experiment not ended when absent. */
  only?: string;
  /** The smallest relative lift to detect, as a percentage; the tool's default when absent. */
  effect?: number;
}

export interface Planned {
  flag: string;
  path: string;
  goal: string;
  /** The number of variants, the control included. */
  variants: number;
  estimate: Estimate;
}

/** Estimates each experiment's running time, from its page's recent traffic and its goal's baseline. */
export async function estimate(
  config: Resolved,
  admin: ExperimentsAdmin,
  { only, effect }: PlanOptions = {},
): Promise<Planned[]> {
  const chosen = choose(config, only).filter((e) => only !== undefined || e.status !== 'ended');
  const found: Planned[] = [];
  for (const e of chosen) {
    const variants = Object.keys(e.split).length;
    found.push({ flag: e.flag, path: e.path, goal: e.goal, variants, estimate: await admin.estimate(declaration(e), effect) });
  }
  return found;
}

export interface Report {
  flag: string;
  path: string;
  /** The experiment's state in the tool; `draft` too when the tool does not hold it yet. */
  state: ToolState;
  started?: string;
  ended?: string;
  /** Absent for a draft. */
  results?: Results;
}

/** Reads each launched experiment's results, as the tool computes them. */
export async function results(
  config: Resolved,
  admin: ExperimentsAdmin,
  { only }: Pick<PlanOptions, 'only'> = {},
): Promise<Report[]> {
  const held = await admin.list();
  const found: Report[] = [];
  for (const e of choose(config, only)) {
    const h = held.find((x) => x.managed && x.flag === e.flag);
    if (!h || h.state === 'draft') {
      found.push({ flag: e.flag, path: e.path, state: 'draft' });
      continue;
    }
    found.push({
      flag: e.flag, path: e.path, state: h.state,
      ...(h.started ? { started: h.started } : {}),
      ...(h.ended ? { ended: h.ended } : {}),
      results: await admin.results(h.id, declaration(e)),
    });
  }
  return found;
}

function choose(config: Resolved, only: string | undefined): Resolved['experiments'] {
  if (only === undefined) return config.experiments;
  const chosen = config.experiments.filter((e) => e.flag === only);
  if (chosen.length === 0) throw new Error(`the configuration has no experiment "${only}"`);
  return chosen;
}
