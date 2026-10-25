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
}

/** What the sync asks the tool to hold for an experiment. */
export interface Declared {
  flag: string;
  path: string;
  goal: string;
  split: Record<string, number>;
}

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

function declaration(e: Resolved['experiments'][number]): Declared {
  return { flag: e.flag, path: e.path, goal: e.goal, split: e.split };
}

function sameSplit(a: Record<string, number>, b: Record<string, number>): boolean {
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every((k) => a[k] === b[k]);
}
