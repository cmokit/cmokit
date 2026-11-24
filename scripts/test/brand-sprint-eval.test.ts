// The brand-sprint eval's own tests. No model is called: a fake client plays both the skill and the
// founder, so these check the harness, the fixtures and the plain-code checks, never the skill.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import type Anthropic from '@anthropic-ai/sdk';
import { check, combine, leavesOtherSections, needsRerun, ranOutOfTurns, savesAfterWrittenYes, type Result } from '../evals/brand-sprint/checks.ts';
import { LINES, PENDING, SAVED } from '../evals/brand-sprint/fixtures.ts';
import { Usage, founderText, run, type Client, type Run, type Turn } from '../evals/brand-sprint/harness.ts';
import { SCENARIOS, type Scenario } from '../evals/brand-sprint/scenarios.ts';

const models = { skill: 'claude-opus-5-5', helper: 'claude-sonnet-5-5' };
const usage0 = { input_tokens: 1000, output_tokens: 100, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 };

const message = (content: Anthropic.ContentBlock[], stop: Anthropic.StopReason): Anthropic.Message => ({
  id: 'msg', type: 'message', role: 'assistant', model: 'fake', content, stop_reason: stop,
  stop_sequence: null, stop_details: null, usage: usage0,
} as unknown as Anthropic.Message);
const say = (text: string) => message([{ type: 'text', text, citations: null } as Anthropic.TextBlock], 'end_turn');
let n = 0;
const use = (name: string, input: Record<string, unknown> = {}) =>
  message([{ type: 'tool_use', id: `t${++n}`, name, input, caller: { type: 'direct' } } as unknown as Anthropic.ToolUseBlock], 'tool_use');

/** Skill replies in order; founder and judge answers by a function of the prompt. */
function fake(skill: Anthropic.Message[], helper: (prompt: string) => unknown) {
  const sent: Anthropic.MessageCreateParamsNonStreaming[] = [];
  const client: Client = {
    messages: {
      async create(params) {
        sent.push(structuredClone(params));
        if (params.tools) {
          const next = skill.shift();
          if (!next) throw new Error('The fake skill ran out of replies.');
          return next;
        }
        return say(JSON.stringify(helper(params.messages[0]!.content as string)));
      },
    },
  };
  return { client, sent };
}

const scenario = (name: string): Scenario => SCENARIOS.find((s) => s.name === name)!;

test("every real line is CMOKit's saved words, verbatim", () => {
  for (const l of LINES.filter((l) => l.kind === 'real')) {
    assert.ok(l.from, `${l.id} names its section`);
    assert.ok(SAVED[l.from].replaceAll('**', '').includes(l.text), `${l.id} is not in ${l.from}`);
  }
  assert.equal(new Set(LINES.map((l) => l.id)).size, LINES.length, 'ids are unique');
  for (const l of LINES.filter((l) => l.kind === 'planted')) assert.match(l.answers, /PLANTED/);
  assert.ok(PENDING.length > 0);
});

test('every line a scenario waits for exists, and is planted or real', () => {
  for (const s of SCENARIOS) {
    if (!('line' in s.until)) continue;
    const kind = LINES.find((l) => l.id === (s.until as { line: string }).line)?.kind;
    assert.ok(kind === 'planted' || kind === 'real', s.name);
  }
});

test('the team scenario: Claude reads the brand, the founder plants a team, the judge reads the reply', async () => {
  const { client, sent } = fake(
    [use('account_status'), use('brand_read'), say('What is the brand in a line, and who is in the sprint?'), say('Who is the decider when you three disagree?')],
    (prompt) => (prompt.startsWith('The conversation so far') ? { reply: 'answer', ids: ['one-liner', 'now', 'planted-team'] } : { pass: true, why: 'It asked for the decider.' }),
  );
  const usage = new Usage();
  const done = await run(client, models, usage, scenario('team-decider'));
  assert.equal(done.ended, 'done');
  assert.equal(done.lineAt, 2);
  const [, first, said, second] = done.turns;
  assert.equal(first!.who === 'claude' && first.calls.map((c) => c.name).join(), 'account_status,brand_read');
  assert.match(said!.text, /^\(typed\) CMOKit is a marketing loop/);
  assert.match(said!.text, /three of us on the founding team/);
  assert.equal(second!.who, 'claude');
  // The tool results went back to the skill, and its read showed CMOKit before the sprint.
  const toolTurn = sent.filter((p) => p.tools)[2]!.messages.at(-1)!;
  assert.match(JSON.stringify(toolTurn.content), /CMOKit private beta waitlist/);

  const verdict = await check(client, models, usage, done, 'asks-the-team-for-its-decider');
  assert.deepEqual(verdict, { check: 'asks-the-team-for-its-decider', pass: true, why: 'It asked for the decider.' });
  assert.ok(usage.cost()! > 0);
});

test('a save after the founder says to save passes, and leaves the offers and examples', async () => {
  const sections = { values: 'Yours to keep: you can leave with everything, any time.' };
  const { client } = fake(
    [use('brand_read'), say('Here is what I will save. Save it?'),
      use('brand_change', { approved: true, base_version: 1, reason: 'Brand sprint', sections }), say('Saved.')],
    () => ({ reply: 'confirm_save', ids: [] }),
  );
  const done = await run(client, models, new Usage(), scenario('cmo-kit-sprint'));
  assert.equal(done.ended, 'done');
  assert.equal(done.after.version, 2);
  assert.equal(done.after.context.sections.values, sections.values);
  assert.equal(done.after.context.offers[0]!.id, 'waitlist');
  assert.equal(savesAfterWrittenYes(done).pass, true);
  assert.equal(leavesOtherSections(done).pass, true);
});

test('a save before the founder says to save fails', async () => {
  const { client } = fake(
    [use('brand_change', { approved: true, base_version: 1, reason: 'Brand sprint', sections: { values: 'Quality' } }), say('Saved.')],
    () => ({ reply: 'stop', ids: [] }),
  );
  const done = await run(client, models, new Usage(), scenario('cmo-kit-sprint'));
  assert.equal(savesAfterWrittenYes(done).pass, false);
});

test('a save that writes examples or offers fails', () => {
  const runWith = (input: Record<string, unknown>): Run => ({
    scenario: 'x', ended: 'done', lineAt: null, after: { version: 2, context: { sections: {}, offers: [] }, at: null },
    turns: [{ who: 'claude', text: '', calls: [{ name: 'brand_change', input: { approved: true, ...input }, ok: true, result: {} }] }],
  });
  assert.equal(leavesOtherSections(runWith({ sections: { examples: 'x' } })).pass, false);
  assert.equal(leavesOtherSections(runWith({ sections: { voice: 'x' }, offers: [] })).pass, false);
  assert.equal(leavesOtherSections(runWith({ sections: { voice: 'x' } })).pass, true);
});

test('a refused brand_change goes back to the skill as an error, not a crash', async () => {
  const { client, sent } = fake(
    [use('brand_change', { approved: false, base_version: 1, reason: 'Brand sprint', sections: { values: 'x' } }), say('I will ask first.')],
    () => ({ reply: 'stop', ids: [] }),
  );
  const done = await run(client, models, new Usage(), scenario('cmo-kit-sprint'));
  const reply = done.turns[1]!;
  assert.ok(reply.who === 'claude' && reply.calls[0]!.ok === false);
  assert.match(JSON.stringify(sent.filter((p) => p.tools)[1]!.messages.at(-1)!.content), /"is_error":true/);
  assert.equal(done.after.version, 1);
});

test('usage prices cache reads and writes', () => {
  const usage = new Usage();
  usage.add('claude-opus-5-5', { input_tokens: 1_000_000, output_tokens: 1_000_000, cache_creation_input_tokens: 1_000_000, cache_read_input_tokens: 1_000_000 } as Anthropic.Usage);
  assert.equal(usage.cost(), 4 + 20 + 5 + 0.2);
  usage.add('some-other-model', usage0 as Anthropic.Usage);
  assert.equal(usage.cost(), null);
});

test('an exercise left open fails the closing check', async () => {
  const done: Run = {
    scenario: 'cmo-kit-sprint', ended: 'done', lineAt: null, after: { version: 1, context: { sections: {}, offers: [] }, at: null },
    turns: [{ who: 'claude', text: 'Where is CMOKit in 5 years?', calls: [] }],
  };
  const judged = (exercises: unknown[]) => fake([], () => ({ exercises })).client;
  const open = await check(judged([{ exercise: 'roadmap', closed: false, why: 'No playback.' }]), models, new Usage(), done, 'closes-each-exercise');
  assert.equal(open.pass, false);
  assert.match(open.why, /roadmap: No playback/);
  const closed = await check(judged([{ exercise: 'roadmap', closed: true, why: 'Confirmed.' }]), models, new Usage(), done, 'closes-each-exercise');
  assert.equal(closed.pass, true);
});

test("Geoff's approved lines reach the skill marked as spoken", () => {
  const text = founderText('answer', ['dont-like', 'filming', 'busywork-kept', 'actually-film']);
  assert.equal(text.split('\n\n').length, 4);
  for (const part of text.split('\n\n')) assert.match(part, /^\(spoken\) /);
});

test('a judged check fails on two of three runs; a code check on any one', () => {
  const r = (check: string, pass: boolean) => ({ check, pass, why: pass ? 'ok' : 'no' }) as Result;
  const judged = 'closes-each-exercise';
  const code = 'saves-after-written-yes';
  assert.equal(needsRerun([r(judged, false), r(code, true)]), true);
  assert.equal(needsRerun([r(judged, false), r(code, false)]), false);
  assert.equal(needsRerun([r(judged, true), r(code, true)]), false);
  const majority = combine([[r(judged, false), r(code, true)], [r(judged, true), r(code, true)], [r(judged, true), r(code, true)]]);
  assert.deepEqual(majority.map((x) => x.pass), [true, true]);
  const codeOnce = combine([[r(judged, false), r(code, true)], [r(judged, true), r(code, false)], [r(judged, true), r(code, true)]]);
  assert.deepEqual(codeOnce.map((x) => x.pass), [true, false]);
  const twice = combine([[r(judged, false)], [r(judged, false)], [r(judged, true)]]);
  assert.equal(twice[0].pass, false);
  assert.match(twice[0].why, /passed 1 of 3 runs/);
});

test('a run cut off before Claude answers the planted line is reported as out of turns', () => {
  const scenario = SCENARIOS.find((s) => s.name === 'generic-values')!;
  const base = { scenario: scenario.name, after: {} } as unknown as Run;
  const founder: Turn = { who: 'founder', reply: 'answer', ids: ['planted-generic-values'], text: 'quality' };
  const claude: Turn = { who: 'claude', text: 'Would a competitor say that?', calls: [] };
  const cut = { ...base, ended: 'max-turns', lineAt: 1, turns: [claude, founder] } as Run;
  assert.match(ranOutOfTurns(scenario, cut)!, /^ran out of turns: .*40-reply cap before Claude answered planted-generic-values/);
  const never = { ...base, ended: 'max-turns', lineAt: null, turns: [claude] } as Run;
  assert.match(ranOutOfTurns(scenario, never)!, /before the founder said planted-generic-values/);
  const answered = { ...base, ended: 'done', lineAt: 1, turns: [claude, founder, claude] } as Run;
  assert.equal(ranOutOfTurns(scenario, answered), null);
  const whole = SCENARIOS.find((s) => s.name === 'cmo-kit-sprint')!;
  assert.equal(ranOutOfTurns(whole, { ...base, ended: 'max-turns', lineAt: null, turns: [] } as Run), null);
});
