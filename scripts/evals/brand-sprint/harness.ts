// Runs one brand-sprint scenario: the skill under test talks with a model playing the founder,
// through CMOkit's real brand tools on a customer held in Node's SQLite, and the checks read the
// transcript. The founder model only chooses which fixture lines to say; the words are always the
// fixture's, so the founder can never invent an answer.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type Anthropic from '@anthropic-ai/sdk';
import { Customer, Refusal, TOOLS, aesGcmVault, type Events, type Sql, type Tool } from '@cmokit/content';
import { BEFORE, LINES, REPLIES, line, type Reply } from './fixtures.ts';
import { OPENING, type Scenario } from './scenarios.ts';

const root = join(import.meta.dirname, '..', '..', '..');
export const SKILL = readFileSync(join(root, 'plugins/cmokit-content/skills/brand-sprint/SKILL.md'), 'utf8');

/** The part of the SDK client the harness uses, so a test can stand in for it. */
export interface Client {
  messages: { create(params: Anthropic.MessageCreateParamsNonStreaming): Promise<Anthropic.Message> };
}

export interface Models {
  /** The model running the skill, as a person's Claude would. */
  skill: string;
  /** The model playing the founder and judging. */
  helper: string;
}

/** Per million tokens, from Anthropic's price list on 2026-11-21. Check it before relying on a total. */
const PRICES: Record<string, { input: number; output: number; cacheRead: number }> = {
  'claude-opus-5-5': { input: 4, output: 20, cacheRead: 0.2 },
  'claude-sonnet-5-5': { input: 2, output: 10, cacheRead: 0.1 },
  'claude-haiku-5-5': { input: 0.1, output: 0.5, cacheRead: 0.01 },
};

export class Usage {
  readonly byModel = new Map<string, { input: number; output: number; cacheWrite: number; cacheRead: number }>();

  add(model: string, usage: Anthropic.Usage) {
    const sum = this.byModel.get(model) ?? { input: 0, output: 0, cacheWrite: 0, cacheRead: 0 };
    sum.input += usage.input_tokens;
    sum.output += usage.output_tokens;
    sum.cacheWrite += usage.cache_creation_input_tokens ?? 0;
    sum.cacheRead += usage.cache_read_input_tokens ?? 0;
    this.byModel.set(model, sum);
  }

  /** Dollars, or null when a model has no price here. A cache write costs 1.25 times an input token. */
  cost(): number | null {
    let total = 0;
    for (const [model, sum] of this.byModel) {
      const price = PRICES[model];
      if (!price) return null;
      total += (sum.input * price.input + sum.cacheWrite * price.input * 1.25 + sum.cacheRead * price.cacheRead + sum.output * price.output) / 1e6;
    }
    return total;
  }
}

export type Turn =
  | { who: 'founder'; reply: Reply | 'answer'; ids: string[]; text: string }
  | { who: 'claude'; text: string; calls: ToolCall[] };

export interface ToolCall { name: string; input: Record<string, any>; ok: boolean; result: unknown }

export interface Run {
  scenario: string;
  turns: Turn[];
  /** Why the run ended: the scenario's condition was met, or it gave up. */
  ended: 'done' | 'max-turns' | 'founder-stopped';
  /** The index in turns of the line the scenario waits for, once the founder said it. */
  lineAt: number | null;
  /** The brand context when the run ended. */
  after: Awaited<ReturnType<Customer['brandRead']>>;
}

const PERSON = 'geoff';
const BASE = 'https://content.example/customers/cmokit';
const SKILL_TOOLS = ['account_status', 'brand_read', 'brand_change'];

const events: Events = {
  vendor: 'stand-in', label: 'Stand-in Events', keyHelp: 'Not used by the brand sprint.',
  verify: async () => undefined, list: async () => [], tally: async () => ({}) as never,
};

/** CMO Kit as a customer, as it stood before its sprint: version 1, with only its waitlist offer. */
export async function cmoKitBeforeSprint(): Promise<Customer> {
  const db = new DatabaseSync(':memory:');
  const sql: Sql = { all: (query, ...params) => db.prepare(query).all(...params) as ReturnType<Sql['all']> };
  const key = btoa(String.fromCharCode(...new Uint8Array(32).map((_, i) => i)));
  let n = 0;
  const customer = new Customer(sql, { vault: aesGcmVault(key), events, now: () => Date.parse('2026-11-14T12:00:00Z'), newId: () => `p${++n}` });
  await customer.addUser(PERSON);
  await customer.brandChange(PERSON, { approved: true, base_version: 0, reason: 'The waitlist offer', offers: BEFORE.offers });
  return customer;
}

const tools = (): { defs: Anthropic.Tool[]; byName: Map<string, Tool> } => {
  const chosen = TOOLS.filter((t) => SKILL_TOOLS.includes(t.name));
  return {
    defs: chosen.map((t) => ({ name: t.name, description: t.description, input_schema: t.inputSchema as Anthropic.Tool.InputSchema })),
    byName: new Map(chosen.map((t) => [t.name, t])),
  };
};

const skillSystem = `You are Claude, talking with a person in the Claude app. The cmokit-content plugin is installed and CMOkit's connector is connected, so its tools are available. The person asked to run a brand sprint, and you loaded this skill:

<skill name="brand-sprint">
${SKILL}
</skill>

The person may dictate. Each part of their message is marked (spoken) or (typed).`;

function founderSystem(scenario: Scenario): string {
  const lines = LINES.map((l) => `- ${l.id} [${l.kind}, ${l.mode}] answers ${l.answers}: ${l.text}`).join('\n');
  const replies = Object.entries(REPLIES).map(([k, v]) => `- ${k}: ${v}`).join('\n');
  return `You play Geoff, the founder of CMO Kit, in a test of a brand-sprint facilitator. You never write your own words: each turn you choose either fixture lines, by id, or one fixed reply.

Lines:
${lines}

Fixed replies:
${replies}

Rules:
- Answer with the ids of the lines that truly answer what Claude just asked, in the order you would say them. Several ids are fine when Claude asks for several things or a list.
- If no line answers it, reply skip. Never pick a line that does not answer the question. When asked to narrow, rank or choose between your answers, reply skip: you have not decided that.
- For a slider, give its number line alone first; give we-are and we-are-not only when asked what the positions mean.
- If Claude offers example answers, reply skip.
- When Claude plays back a decision, reply confirm only if everything in it is something your lines said; otherwise reply correct.
- When Claude shows what it will save and asks whether to save it, reply confirm_save only if it holds nothing your lines did not say; otherwise reply correct.
- Prefer spoken lines when Claude invites you to talk and a spoken line answers.
- Never use a planted line unless these scenario instructions tell you to: ${scenario.founder}
- If Claude is waiting on nothing from you and the sprint is over, reply stop.`;
}

const FOUNDER_SCHEMA = {
  type: 'object',
  properties: {
    reply: { type: 'string', enum: ['answer', ...Object.keys(REPLIES)] },
    ids: { type: 'array', items: { type: 'string' } },
  },
  required: ['reply', 'ids'],
  additionalProperties: false,
};

/** What the founder says for a choice: fixture lines, each part marked spoken or typed. */
export function founderText(reply: Reply | 'answer', ids: string[]): string {
  if (reply !== 'answer') return `(typed) ${REPLIES[reply]}`;
  return ids.map((id) => { const l = line(id); return `(${l.mode}) ${l.text}`; }).join('\n\n');
}

export function render(turns: Turn[]): string {
  return turns.map((t) => (t.who === 'founder' ? `Geoff: ${t.text}` : `Claude: ${t.text}`)).join('\n\n');
}

function text(message: Anthropic.Message): string {
  return message.content.filter((b): b is Anthropic.TextBlock => b.type === 'text').map((b) => b.text).join('\n').trim();
}

function guard(message: Anthropic.Message): Anthropic.Message {
  if (message.stop_reason === 'refusal') throw new Error(`The model declined: ${message.stop_details?.explanation ?? 'no explanation'}`);
  if (message.stop_reason === 'max_tokens') throw new Error('The model ran out of tokens mid-reply.');
  return message;
}

/** A structured answer from the helper model. */
export async function ask<T>(client: Client, usage: Usage, model: string, system: string, prompt: string, schema: Record<string, unknown>): Promise<T> {
  const message = guard(await client.messages.create({
    // The system prompt repeats on every founder turn, so it is cached; the transcript is not.
    model, max_tokens: 4000, system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: prompt }],
    output_config: { format: { type: 'json_schema', schema } },
  }));
  usage.add(model, message.usage);
  return JSON.parse(text(message)) as T;
}

export async function run(client: Client, models: Models, usage: Usage, scenario: Scenario): Promise<Run> {
  const customer = await cmoKitBeforeSprint();
  const { defs, byName } = tools();
  const messages: Anthropic.MessageParam[] = [{ role: 'user', content: `(typed) ${OPENING}` }];
  const turns: Turn[] = [{ who: 'founder', reply: 'answer', ids: [], text: `(typed) ${OPENING}` }];
  let lineAt: number | null = null;
  let saved = false;

  for (let reply = 0; reply < scenario.maxTurns; reply++) {
    // Claude's turn: as many model calls as its tool calls take.
    const calls: ToolCall[] = [];
    for (;;) {
      const message = guard(await client.messages.create({
        model: models.skill, max_tokens: 16000, system: skillSystem, tools: defs, messages,
        cache_control: { type: 'ephemeral' },
      }));
      usage.add(models.skill, message.usage);
      messages.push({ role: 'assistant', content: message.content });
      const uses = message.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');
      if (message.stop_reason !== 'tool_use' || uses.length === 0) {
        turns.push({ who: 'claude', text: text(message), calls });
        break;
      }
      const results: Anthropic.ToolResultBlockParam[] = [];
      for (const use of uses) {
        const input = use.input as Record<string, any>;
        const tool = byName.get(use.name);
        try {
          if (!tool) throw new Refusal(`There is no tool ${use.name}.`);
          const result = await tool.call(input, { person: PERSON, base: BASE, customer });
          calls.push({ name: use.name, input, ok: true, result });
          if (use.name === 'brand_change') saved = true;
          results.push({ type: 'tool_result', tool_use_id: use.id, content: JSON.stringify(result) });
        } catch (error) {
          if (!(error instanceof Refusal)) throw error;
          calls.push({ name: use.name, input, ok: false, result: error.message });
          results.push({ type: 'tool_result', tool_use_id: use.id, content: error.message, is_error: true });
        }
      }
      messages.push({ role: 'user', content: results });
    }

    const until = scenario.until;
    if ('saved' in until && saved) return { scenario: scenario.name, turns, ended: 'done', lineAt, after: await customer.brandRead() };
    if ('line' in until && lineAt !== null && turns.filter((t, i) => i > lineAt! && t.who === 'claude').length >= until.replies) {
      return { scenario: scenario.name, turns, ended: 'done', lineAt, after: await customer.brandRead() };
    }

    // The founder's turn.
    const choice = await ask<{ reply: Reply | 'answer'; ids: string[] }>(
      client, usage, models.helper, founderSystem(scenario),
      `The conversation so far:\n\n${render(turns)}\n\nChoose Geoff's next reply to Claude's last message.`,
      FOUNDER_SCHEMA,
    );
    const ids = choice.reply === 'answer' ? choice.ids.filter((id) => LINES.some((l) => l.id === id)) : [];
    const said: Turn = ids.length || choice.reply !== 'answer'
      ? { who: 'founder', reply: choice.reply, ids, text: founderText(choice.reply, ids) }
      : { who: 'founder', reply: 'skip', ids: [], text: founderText('skip', []) };
    turns.push(said);
    if ('line' in until && lineAt === null && ids.includes(until.line)) lineAt = turns.length - 1;
    if (said.reply === 'stop') return { scenario: scenario.name, turns, ended: 'founder-stopped', lineAt, after: await customer.brandRead() };
    messages.push({ role: 'user', content: said.text });
  }
  return { scenario: scenario.name, turns, ended: 'max-turns', lineAt, after: await customer.brandRead() };
}
