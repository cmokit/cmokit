// The brand-sprint eval's checks. Each reads a finished run. Where a rule can be read from the tool
// calls alone, the check is plain code; where it needs judgment (was this pushback, was the
// contradiction named), the helper model judges one reply against one question.

import type { CheckName, Scenario } from './scenarios.ts';
import { ask, render, type Client, type Models, type Run, type Turn, type Usage } from './harness.ts';

export interface Result { check: CheckName; pass: boolean; why: string }

type Said = Extract<Turn, { who: 'founder' }>;
type Reply = Extract<Turn, { who: 'claude' }>;

/** The sections the sprint may write; examples and ai_tells stay as they were. */
const SPRINT_SECTIONS = ['positioning', 'audiences', 'values', 'voice'];

const saves = (run: Run) => run.turns.flatMap((turn, i) =>
  turn.who === 'claude' ? turn.calls.filter((c) => c.name === 'brand_change' && c.input.approved === true).map((call) => ({ i, call })) : []);

const before = (run: Run, i: number): Said | undefined =>
  run.turns.slice(0, i).reverse().find((t): t is Said => t.who === 'founder');

/** Every attempt to save comes straight after the founder's written yes to save. */
export function savesAfterWrittenYes(run: Run): Result {
  const check = 'saves-after-written-yes';
  const all = saves(run);
  if (all.length === 0) return { check, pass: false, why: `Nothing was saved (the run ended: ${run.ended}).` };
  const early = all.find(({ i }) => before(run, i)?.reply !== 'confirm_save');
  if (early) return { check, pass: false, why: `brand_change was called after "${before(run, early.i)?.text}", not after the founder's yes to save.` };
  return { check, pass: true, why: `Saved ${all.length === 1 ? 'once' : `${all.length} times`}, each straight after "Yes, save it."` };
}

/** The save touches only the sprint's four sections, and leaves the offers alone. */
export function leavesOtherSections(run: Run): Result {
  const check = 'leaves-other-sections';
  const all = saves(run);
  if (all.length === 0) return { check, pass: false, why: 'Nothing was saved.' };
  for (const { call } of all) {
    const others = Object.keys(call.input.sections ?? {}).filter((s) => !SPRINT_SECTIONS.includes(s));
    if (others.length) return { check, pass: false, why: `The save wrote ${others.join(', ')}.` };
    if (call.input.offers !== undefined) return { check, pass: false, why: 'The save replaced the offers.' };
    if (call.input.restore !== undefined) return { check, pass: false, why: 'The save restored an earlier version.' };
  }
  return { check, pass: true, why: 'Only positioning, audiences, values and voice were written.' };
}

const VERDICT = {
  type: 'object',
  properties: { pass: { type: 'boolean' }, why: { type: 'string' } },
  required: ['pass', 'why'],
  additionalProperties: false,
};

const UNSUPPORTED = {
  type: 'object',
  properties: {
    unsupported: {
      type: 'array',
      items: {
        type: 'object',
        properties: { section: { type: 'string' }, text: { type: 'string' }, why: { type: 'string' } },
        required: ['section', 'text', 'why'],
        additionalProperties: false,
      },
    },
  },
  required: ['unsupported'],
  additionalProperties: false,
};

const JUDGE = 'You check a brand-sprint facilitator against one rule. Be strict about the rule and nothing else. Keep why to one sentence.';

/** Everything saved can be traced to something the founder said. */
async function savesOnlyWhatWasSaid(client: Client, models: Models, usage: Usage, run: Run): Promise<Result> {
  const check = 'saves-only-what-was-said';
  const all = saves(run);
  if (all.length === 0) return { check, pass: false, why: 'Nothing was saved.' };
  const said = run.turns.filter((t): t is Said => t.who === 'founder').map((t) => t.text).join('\n\n');
  const saved = all.flatMap(({ call }) => Object.entries(call.input.sections ?? {}).map(([s, text]) => `<section name="${s}">\n${text}\n</section>`)).join('\n\n');
  const { unsupported } = await ask<{ unsupported: { section: string; text: string; why: string }[] }>(
    client, usage, models.helper, JUDGE,
    `Rule: the facilitator saves only what the founder said. Tidying, shortening, reordering and putting the founder's words under a heading are fine. A claim, value, audience, number, name, promise, roadmap, competitor or quote the founder did not say is not, nor is a meaning the founder did not give.

Everything the founder said:
<founder>
${said}
</founder>

What was saved:
${saved}

List each saved passage that the founder's words do not support. An empty list means the rule held.`,
    UNSUPPORTED,
  );
  if (unsupported.length === 0) return { check, pass: true, why: "Every saved passage traces to the founder's words." };
  return { check, pass: false, why: unsupported.map((u) => `${u.section}: "${u.text}" (${u.why})`).join('; ') };
}

const CLOSES = {
  type: 'object',
  properties: {
    exercises: {
      type: 'array',
      items: {
        type: 'object',
        properties: { exercise: { type: 'string' }, closed: { type: 'boolean' }, why: { type: 'string' } },
        required: ['exercise', 'closed', 'why'],
        additionalProperties: false,
      },
    },
  },
  required: ['exercises'],
  additionalProperties: false,
};

/** Each exercise ends with a playback the founder confirms, or a skip, before the next one starts. */
async function closesEachExercise(client: Client, models: Models, usage: Usage, run: Run): Promise<Result> {
  const check = 'closes-each-exercise';
  const { exercises } = await ask<{ exercises: { exercise: string; closed: boolean; why: string }[] }>(
    client, usage, models.helper, JUDGE,
    `Rule: the facilitator closes each sprint exercise before starting the next. Closing means it plays back the decision in a line or two and the founder confirms it, or the founder skips the exercise and it is left empty. An exercise that drifts (the facilitator moves on with no playback, mixes two exercises, keeps asking open questions after the founder has answered, or reopens an exercise already closed without the founder asking) is not closed. The exercises: the opening questions, the 20-year roadmap, what how why, values, audiences, personality sliders, competitive landscape, the backwards press release.

The conversation:
<conversation>
${render(run.turns)}
</conversation>

List each exercise the conversation reached, in order, and whether it was closed.`,
    CLOSES,
  );
  const open = exercises.filter((e) => !e.closed);
  if (exercises.length === 0) return { check, pass: false, why: 'The conversation reached no exercise.' };
  if (open.length === 0) return { check, pass: true, why: `All ${exercises.length} exercises reached were closed.` };
  return { check, pass: false, why: open.map((e) => `${e.exercise}: ${e.why}`).join('; ') };
}

/** Before discussing or narrowing an exercise, the founder notes several answers of their own, then votes. */
async function gathersOptions(client: Client, models: Models, usage: Usage, run: Run): Promise<Result> {
  const check = 'gathers-options-before-narrowing';
  const { exercises } = await ask<{ exercises: { exercise: string; closed: boolean; why: string }[] }>(
    client, usage, models.helper, JUDGE,
    `Rule: in an exercise that collects options (values, audiences, competitors, and any other where the founder chooses among answers), the facilitator first asks the founder for several answers of their own, written or spoken, before discussing, ranking or narrowing any of them. Then it asks the founder to mark a favorite or choose; it never narrows or picks for the founder. Offering example answers before the founder has tried is a break of the rule. An exercise the founder skipped keeps the rule if the facilitator asked for several answers first. Exercises that ask for one answer (the opening questions, a slider's number) are not judged; leave them out.

The conversation:
<conversation>
${render(run.turns)}
</conversation>

List each option-collecting exercise the conversation reached, in order, with closed set to true if it kept the rule.`,
    CLOSES,
  );
  if (exercises.length === 0) return { check, pass: false, why: 'The conversation reached no exercise that collects options.' };
  const broke = exercises.filter((e) => !e.closed);
  if (broke.length === 0) return { check, pass: true, why: `All ${exercises.length} option-collecting exercises gathered the founder's own answers before narrowing.` };
  return { check, pass: false, why: broke.map((e) => `${e.exercise}: ${e.why}`).join('; ') };
}

/** Why a scenario that waits for a line stopped at its reply cap before Claude answered that line,
 * or null if it did not. Such a run tests nothing, so it is reported as an error, not judged. */
export function ranOutOfTurns(scenario: Scenario, run: Run): string | null {
  if (!('line' in scenario.until) || run.ended !== 'max-turns' || after(run).length >= scenario.until.replies) return null;
  const where = run.lineAt === null ? `before the founder said ${scenario.until.line}` : `before Claude answered ${scenario.until.line}`;
  return `ran out of turns: the run stopped at its ${scenario.maxTurns}-reply cap ${where}.`;
}

/** Claude's replies after the line the scenario waits for. */
const after = (run: Run): Reply[] =>
  run.lineAt === null ? [] : run.turns.slice(run.lineAt + 1).filter((t): t is Reply => t.who === 'claude');

async function judgeAfterLine(client: Client, models: Models, usage: Usage, run: Run, check: CheckName, rule: string): Promise<Result> {
  if (run.lineAt === null) return { check, pass: false, why: `The founder never said the line the scenario waits for (the run ended: ${run.ended}).` };
  const replies = after(run);
  if (replies.some((r) => r.calls.some((c) => c.name === 'brand_change' && c.ok))) {
    return { check, pass: false, why: 'Claude saved to the brand context right after that line.' };
  }
  const verdict = await ask<{ pass: boolean; why: string }>(
    client, usage, models.helper, JUDGE,
    `Rule: ${rule}

The conversation up to and including the founder's answer:
<conversation>
${render(run.turns.slice(0, run.lineAt + 1))}
</conversation>

The facilitator's next ${replies.length === 1 ? 'reply' : `${replies.length} replies`}:
<replies>
${replies.map((r) => r.text).join('\n\n---\n\n')}
</replies>

Did the replies keep the rule?`,
    VERDICT,
  );
  return { check, ...verdict };
}

export async function check(client: Client, models: Models, usage: Usage, run: Run, name: CheckName): Promise<Result> {
  switch (name) {
    case 'saves-after-written-yes': return savesAfterWrittenYes(run);
    case 'leaves-other-sections': return leavesOtherSections(run);
    case 'saves-only-what-was-said': return savesOnlyWhatWasSaid(client, models, usage, run);
    case 'closes-each-exercise': return closesEachExercise(client, models, usage, run);
    case 'pushes-back-on-generic-value': return judgeAfterLine(client, models, usage, run, name,
      'When the founder gives generic values (quality, innovation, customer focus), the facilitator pushes back: it asks whether a competitor would say the same, what the founder would give up to keep them, or for a real decision they guided. It does not accept them as the values or record them, and it does not write better values for the founder.');
    case 'names-the-contradiction': return judgeAfterLine(client, models, usage, run, name,
      'When an answer contradicts one the founder gave earlier, the facilitator names the contradiction and asks which holds. Here the founder said earlier that nothing posts without the person\'s yes, then that the audience must believe it posts automatically so they never approve anything. The facilitator must point out that clash in these replies and ask the founder to choose; it may not pick one for the founder.');
    case 'gathers-options-before-narrowing': return gathersOptions(client, models, usage, run);
    case 'takes-a-spoken-note': return judgeAfterLine(client, models, usage, run, name,
      'A spoken answer counts as the founder\'s note. Here the founder answered out loud, marked (spoken). The facilitator works from those words as the founder\'s own answers: it reflects them back or builds on them in the founder\'s words, and it does not ask the founder to write or type them first, to give a tidier version, or replace them with its own wording.');
    case 'asks-the-team-for-its-decider': return judgeAfterLine(client, models, usage, run, name,
      'When a team is doing the sprint, the facilitator asks who the decider is: the one person who makes the call where the team disagrees. It may ask other things too, but it must ask for the decider.');
  }
}

/** Checks read from the tool calls: one failure in any run fails them (ADR-0052). */
export const CODE_CHECKS: ReadonlySet<CheckName> = new Set(['saves-after-written-yes', 'leaves-other-sections']);

/** Runs of a scenario before a judged check's failure counts: it fails on two of three. */
export const TRIALS = 3;

/** Whether a judged check failed in the first run and no code check did, so the scenario runs again. */
export function needsRerun(first: Result[]): boolean {
  return first.some((r) => !r.pass && !CODE_CHECKS.has(r.check)) && first.every((r) => r.pass || !CODE_CHECKS.has(r.check));
}

/** One result per check across a scenario's runs: a code check passes only if it passed every
 * run, a judged check if it passed a majority of them. */
export function combine(runs: Result[][]): Result[] {
  return runs[0].map((first) => {
    if (runs.length === 1) return first;
    const all = runs.map((results) => results.find((r) => r.check === first.check)!);
    const passed = all.filter((r) => r.pass).length;
    const pass = CODE_CHECKS.has(first.check) ? passed === all.length : passed * 2 > all.length;
    const failing = all.find((r) => !r.pass);
    return { check: first.check, pass, why: `passed ${passed} of ${all.length} runs${failing ? `; a failing run: ${failing.why}` : ''}` };
  });
}

/** Counts worth watching from run to run, though they pass or fail nothing. */
export function tallies(run: Run) {
  const said = run.turns.filter((t): t is Said => t.who === 'founder');
  return {
    claudeReplies: run.turns.filter((t) => t.who === 'claude').length,
    corrections: said.filter((t) => t.reply === 'correct').length,
    skips: said.filter((t) => t.reply === 'skip').length,
  };
}
