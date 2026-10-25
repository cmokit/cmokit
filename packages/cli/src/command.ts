// The `cmokit` command (ADR-0013). `cmokit experiments sync` makes the experiments tool match the
// configuration, and is run by the deploy after the edge is deployed. `plan` estimates how long each
// experiment must run, and `results` reads each one's results, as the tool computes them. `mcp`
// offers an agent the same, except that it only previews a sync: the deploy makes the change.

import { estimate, results, sync } from './experiments.ts';
import { serve } from './mcp.ts';
import { connect, describePlans, describeReports, describeSync, KEY_VARIABLE, CONFIG_FILE, type Io } from './session.ts';

export { KEY_VARIABLE } from './session.ts';

const USAGE = `Usage: cmokit experiments sync [--dry-run] [--config <file>]
       cmokit experiments plan [<flag>] [--effect <percent>] [--json] [--config <file>]
       cmokit experiments results [<flag>] [--json] [--config <file>]
       cmokit mcp [--config <file>]

  sync      Makes PostHog's experiments match cmokit.config.ts.
  plan      Estimates how long each experiment not ended must run, from its page's recent traffic
            and its goal's conversion rate there.
  results   Reads each experiment's results on its goal, as PostHog computes them.
  mcp       Serves plan, results and a preview of sync to an agent, as an MCP server on stdio.

  --dry-run   Print what would change, and change nothing.
  --effect    The smallest relative lift to detect, in percent. Defaults to the project's default.
  --json      Print JSON instead of text.
  --config    The configuration file. Defaults to cmokit.config.ts.

  Reads PostHog's personal API key from ${KEY_VARIABLE}.`;

export interface CommandIo extends Io {
  out(line: string): void;
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
  const parsed: Parsed = { command, file: CONFIG_FILE, dryRun: false, json: false };
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
  if (args[0] === 'mcp') {
    const file = args[1] === '--config' && args[2] ? args[2] : CONFIG_FILE;
    if (args.length !== 1 && !(args.length === 3 && args[1] === '--config')) {
      io.out(USAGE);
      return 2;
    }
    await serve(file, io);
    return 0;
  }
  const parsed = parse(args);
  if (!parsed) {
    io.out(USAGE);
    return args[0] === undefined || args[0] === '--help' ? 0 : 2;
  }

  try {
    const { config, admin } = await connect(parsed.file, io);
    if (parsed.command === 'plan') {
      const found = await estimate(config, admin, { only: parsed.only, effect: parsed.effect });
      for (const line of parsed.json ? [JSON.stringify(found, null, 2)] : describePlans(found)) io.out(line);
      return 0;
    }
    if (parsed.command === 'results') {
      const found = await results(config, admin, { only: parsed.only });
      for (const line of parsed.json ? [JSON.stringify(found, null, 2)] : describeReports(found)) io.out(line);
      return 0;
    }
    const plan = await sync(config, admin, { dryRun: parsed.dryRun });
    for (const line of describeSync(plan, parsed.dryRun)) io.out(line);
    return plan.problems.length > 0 ? 1 : 0;
  } catch (error) {
    io.out(`cmokit: ${(error as Error).message}`);
    return 1;
  }
}
