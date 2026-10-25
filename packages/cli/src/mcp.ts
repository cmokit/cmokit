// `cmokit mcp`: CMOkit's MCP server, on stdio (ADR-0013). It offers an agent what the command line
// offers a person, except that it only previews a sync: starting, ending or changing an experiment is
// a change to the configuration that a person approves, and the deploy carries it out. It speaks
// JSON-RPC, one message per line, as the MCP specification's stdio transport has it.

import { readFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { estimate, results, sync } from './experiments.ts';
import { connect, describePlans, describeReports, describeSync, KEY_VARIABLE, type Io } from './session.ts';

const VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];

const INSTRUCTIONS = `CMOkit runs a site's landing-page experiments from cmokit.config.ts. Each experiment names its
page, its variants (each a page of the site), its goal event and its status: draft, running or
ended. Every deploy makes PostHog match the file, so to start, end or change an experiment, edit its
status in cmokit.config.ts and propose the change for a person to approve; never change it in
PostHog. Before starting one, call experiments_plan to see how long it must run. A variant has won
when experiments_results calls it significant and its whole lift interval is above zero.`.replace(/\n/g, ' ');

interface Tool {
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
  call(args: Record<string, unknown>, file: string, io: Io): Promise<{ text: string[]; data: Record<string, unknown> }>;
}

const flagInput = {
  flag: { type: 'string', description: 'Only this experiment, by its flag. Every experiment when absent.' },
};

const TOOLS: Tool[] = [
  {
    name: 'experiments_plan',
    title: 'Plan experiments',
    description: 'Estimates how long each experiment that has not ended must run to detect a given lift, from '
      + 'the visitors who reached its page over recent weeks and the share of them who sent its goal. '
      + 'Use it before setting an experiment\'s status to running.',
    inputSchema: {
      type: 'object',
      properties: {
        ...flagInput,
        effect: {
          type: 'number', exclusiveMinimum: 0,
          description: 'The smallest relative lift to detect, in percent. The PostHog project\'s default when absent.',
        },
      },
      additionalProperties: false,
    },
    async call(args, file, io) {
      const { config, admin } = await connect(file, io);
      const found = await estimate(config, admin, { only: optionalString(args.flag, 'flag'), effect: effect(args.effect) });
      return { text: describePlans(found), data: { experiments: found } };
    },
  },
  {
    name: 'experiments_results',
    title: 'Read experiment results',
    description: 'Reads each started experiment\'s results on its goal, as PostHog computes them: for each '
      + 'variant, the visitors exposed and converted and, against the control, the interval of its '
      + 'relative lift, its chance to win or p-value, and whether PostHog judges the difference significant.',
    inputSchema: { type: 'object', properties: flagInput, additionalProperties: false },
    async call(args, file, io) {
      const { config, admin } = await connect(file, io);
      const found = await results(config, admin, { only: optionalString(args.flag, 'flag') });
      return { text: describeReports(found), data: { experiments: found } };
    },
  },
  {
    name: 'experiments_preview_sync',
    title: 'Preview the next deploy',
    description: 'Shows what the next deploy would change in PostHog to match cmokit.config.ts as it is now, '
      + 'and any problem that would stop it. Changes nothing.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    async call(_args, file, io) {
      const { config, admin } = await connect(file, io);
      const plan = await sync(config, admin, { dryRun: true });
      return { text: describeSync(plan, true), data: { ...plan } };
    },
  },
];

type Message = { jsonrpc?: string; id?: string | number | null; method?: string; params?: Record<string, any> };

/** Answers one JSON-RPC message, or returns undefined for a notification. */
export function createServer(file: string, io: Io) {
  return async function handle(raw: string): Promise<object | undefined> {
    let message: Message;
    try {
      message = JSON.parse(raw);
    } catch {
      return failure(null, -32700, 'Parse error');
    }
    const { id, method, params = {} } = message;
    if (id === undefined) return undefined;
    if (method === 'initialize') {
      const asked = params.protocolVersion;
      return success(id, {
        protocolVersion: VERSIONS.includes(asked) ? asked : VERSIONS[0],
        capabilities: { tools: {} },
        serverInfo: { name: 'cmokit', version: version() },
        instructions: INSTRUCTIONS,
      });
    }
    if (method === 'ping') return success(id, {});
    if (method === 'tools/list') {
      return success(id, { tools: TOOLS.map(({ call: _call, ...tool }) => tool) });
    }
    if (method === 'tools/call') {
      const tool = TOOLS.find((t) => t.name === params.name);
      if (!tool) return failure(id, -32602, `Unknown tool: ${params.name}`);
      try {
        const { text, data } = await tool.call(params.arguments ?? {}, file, io);
        return success(id, { content: [{ type: 'text', text: text.join('\n') }], structuredContent: data });
      } catch (error) {
        return success(id, { content: [{ type: 'text', text: explain(error as Error) }], isError: true });
      }
    }
    return failure(id, -32601, `Method not found: ${method}`);
  };
}

/** Serves on stdin and stdout until stdin closes. */
export async function serve(file: string, io: Io): Promise<void> {
  const handle = createServer(file, io);
  const pending: Promise<void>[] = [];
  for await (const line of createInterface({ input: process.stdin, crlfDelay: Infinity })) {
    if (line.trim() === '') continue;
    pending.push(handle(line).then((answer) => {
      if (answer) process.stdout.write(`${JSON.stringify(answer)}\n`);
    }));
  }
  await Promise.all(pending);
}

function explain(error: Error): string {
  if (error.message === `${KEY_VARIABLE} is not set`) {
    return `${KEY_VARIABLE} is not set in the environment this MCP server runs in. Ask the person to set it `
      + 'in the shell that starts the agent, and restart the agent. Never ask for the key itself.';
  }
  return error.message;
}

function optionalString(value: unknown, name: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') throw new Error(`${name} must be a string`);
  return value;
}

function effect(value: unknown): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'number' || !(value > 0)) throw new Error('effect must be a percentage greater than 0');
  return value;
}

const success = (id: string | number | null, result: object) => ({ jsonrpc: '2.0', id, result });
const failure = (id: string | number | null, code: number, message: string) => ({ jsonrpc: '2.0', id, error: { code, message } });

function version(): string {
  const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string };
  return manifest.version;
}
