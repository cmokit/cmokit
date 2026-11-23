// Runs the brand-sprint evals (ADR-0052) against the brand-sprint skill, with CMOKit's own
// sprint as the founder's answers. It calls Claude through Anthropic's API, so it needs
// credentials and costs money: it prints the cost of each run. Not part of `npm test` or CI. On a
// laptop that is ANTHROPIC_API_KEY or `ant auth login`; in CI, workload identity federation
// (.github/workflows/brand-sprint-evals.yml). The SDK finds whichever is there.
//
//   npm run eval:brand-sprint                       every scenario
//   npm run eval:brand-sprint -- contradiction      one or more, by name
//
// EVAL_MODEL sets the model running the skill (default claude-opus-5-5); EVAL_HELPER_MODEL the one
// playing the founder and judging (default claude-sonnet-5-5). Transcripts go to .evals/brand-sprint/.

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import Anthropic from '@anthropic-ai/sdk';
import { check, tallies, type Result } from './evals/brand-sprint/checks.ts';
import { PENDING } from './evals/brand-sprint/fixtures.ts';
import { Usage, render, run, type Models } from './evals/brand-sprint/harness.ts';
import { SCENARIOS } from './evals/brand-sprint/scenarios.ts';

const names = process.argv.slice(2);
const unknown = names.filter((n) => !SCENARIOS.some((s) => s.name === n));
if (unknown.length) {
  console.error(`No scenario ${unknown.join(', ')}. Scenarios: ${SCENARIOS.map((s) => s.name).join(', ')}.`);
  process.exit(2);
}
const chosen = names.length ? SCENARIOS.filter((s) => names.includes(s.name)) : SCENARIOS;

const models: Models = {
  skill: process.env.EVAL_MODEL ?? 'claude-opus-5-5',
  helper: process.env.EVAL_HELPER_MODEL ?? 'claude-sonnet-5-5',
};
const client = new Anthropic({ maxRetries: 4 });
const out = join(import.meta.dirname, '..', '.evals', 'brand-sprint', new Date().toISOString().replace(/[:.]/g, '-'));
mkdirSync(out, { recursive: true });

console.log(`Brand-sprint evals: skill on ${models.skill}, founder and judge on ${models.helper}.`);
console.log(`Exercises with no real CMOKit answer yet, which the founder skips:\n${PENDING.map((p) => `  - ${p}`).join('\n')}\n`);

const outcomes = await Promise.all(chosen.map(async (scenario) => {
  const usage = new Usage();
  try {
    const finished = await run(client, models, usage, scenario);
    const results: Result[] = [];
    for (const name of scenario.checks) results.push(await check(client, models, usage, finished, name));
    writeFileSync(join(out, `${scenario.name}.json`), JSON.stringify({ ...finished, scenario, models, results }, null, 2));
    writeFileSync(join(out, `${scenario.name}.md`), `# ${scenario.summary}\n\n${render(finished.turns)}\n`);
    return { scenario, results, usage, tally: tallies(finished), error: null };
  } catch (error) {
    return { scenario, results: [], usage, tally: null, error: error instanceof Error ? error.message : String(error) };
  }
}));

let failed = false;
let total = 0;
for (const { scenario, results, usage, tally, error } of outcomes) {
  const cost = usage.cost();
  total += cost ?? 0;
  console.log(`${scenario.name}: ${scenario.summary} (${cost === null ? 'cost unknown for this model' : `$${cost.toFixed(2)}`})`);
  if (error) {
    failed = true;
    console.log(`  ERROR ${error}`);
    continue;
  }
  for (const r of results) {
    failed ||= !r.pass;
    console.log(`  ${r.pass ? 'pass' : 'FAIL'} ${r.check}: ${r.why}`);
  }
  if (tally) console.log(`  ${tally.claudeReplies} replies from Claude, ${tally.corrections} corrections, ${tally.skips} skips`);
}
console.log(`\nAbout $${total.toFixed(2)} in all. Transcripts: ${out}`);
process.exit(failed ? 1 : 0);
