---
status: "proposed"
kind: "requirement-driven"
date: 2026-11-23
decision-makers: [Geoff]
---

# ADR-0052: A skill is evaluated by a script of its own, run on Claude only when a maintainer labels the pull request

**Requirements served:** `CNT-04`, `CNT-05`. Bears on `AGT-04` and `CNT-24`, which it does not yet meet (see Open questions).

## Context and Problem Statement

A skill is instructions that a model follows, so `npm test` cannot show whether it behaves. The only
evidence is to run the skill on Claude and read what it did. That costs money on every run (about
$1.60 to $1.80 for the brand sprint's five scenarios), takes minutes, and gives a different
transcript each time.

The brand sprint skill is the first to need this. It must leave empty what the founder did not
supply (`CNT-05`) and run a guided exercise one person can finish alone (`CNT-04`). Those are rules
about a conversation, and a conversation needs someone on the other side.

## Decision Drivers

* Cost: each run spends real tokens, so it should run when a maintainer wants evidence, not by habit.
* Honesty of the test: the simulated founder must not be able to invent answers, or a check that
  "nothing is invented" proves nothing.
* Simplicity: the smallest thing that gives a pass or fail per rule, readable by one maintainer.
* No stored secrets in CI.

## Considered Options

* One script per skill, run on Claude in CI when a maintainer adds the `run-evals` label
* Run the evals on every pull request
* An eval framework, such as `claude plugin eval`
* Run each scenario against several models

## Decision Outcome

Chosen option: "One script per skill, run on Claude in CI when a maintainer adds the `run-evals`
label", because it spends tokens only when the maintainer asks for evidence before a merge, and a
plain script is the least to build and read.

> We will evaluate each skill with a script of its own, run against one model, only when a
> maintainer labels the pull request `run-evals`.

How the brand sprint's evals work, as `scripts/eval-brand-sprint.ts` and
`scripts/evals/brand-sprint/` build them:

* **Scenarios** (`scenarios.ts`): one runs CMOKit's whole sprint through to the save; the others
  each plant one answer (a spoken note, generic values, a contradiction, a team with no decider) and
  stop soon after it. Each has its own cap on Claude's replies; a run that hits it ends as
  `max-turns`.
* **The founder** (`harness.ts`, `fixtures.ts`): a model plays the founder, but chooses only which
  fixture lines to say, or a fixed reply such as skip or confirm. Its words are always the
  fixture's, copied from CMOKit's saved brand context, and a test checks that every real line
  still appears there.
* **The skill** runs on `claude-opus-5-5` (`EVAL_MODEL`) with CMOKit's real `account_status`,
  `brand_read` and `brand_change` tools, on a customer held in an in-memory database.
* **Checks** (`checks.ts`): a rule readable from the tool calls is plain code (saved only after the
  founder's yes; only the four sprint sections written). A rule that needs judgment is graded by
  `claude-sonnet-5-5` (`EVAL_HELPER_MODEL`) against that one rule, in one sentence.
* **Results:** the run prints each check, its reason and the cost. In CI the output goes to the job
  summary and the transcripts to the `brand-sprint-transcripts` artifact.
* **In CI** (`.github/workflows/brand-sprint-evals.yml`): the `run-evals` label starts one run,
  which takes the label off when it ends. Pull requests from forks are skipped. The job signs in to
  Anthropic by workload identity federation, with no stored key.

### Consequences

* Good, because nothing is spent unless the maintainer asks, and each answer costs a known amount.
* Good, because the founder cannot invent, so a check that nothing was invented means something.
* Bad, because a merge without the label has no evidence, and nothing stops it.
* Bad, because one run is one sample: the same skill can pass a check on one run and fail it on the
  next.
* Neutral, because each new skill writes its own script, sharing what it can with this one.

### Confirmation

Enforced by review. The label run reports an `evals` check on the pull request, which fails when
any check fails, but no branch rule requires it. `npm test` covers the harness and the fixtures,
not the skill.

## Pros and Cons of the Options

### One script per skill, run when a maintainer adds the `run-evals` label

* Good, because cost follows the maintainer's choice, decided on 2026-11-21.
* Good, because a script is readable top to bottom, with no framework to learn.
* Bad, because evidence depends on someone remembering to ask for it.

### Run the evals on every pull request

* Good, because every change would carry evidence.
* Bad, because most pull requests do not touch a skill, and each run costs real money and minutes.
  Rejected on 2026-11-21: evals run only when the maintainer triggers them before a merge.

### An eval framework, such as `claude plugin eval`

* Good, because it brings sandboxing, reports and a suite format that others already know.
* Bad, because for one skill it is more to learn and configure than a script, and the brand
  sprint's checks (a scripted founder, a judge per rule) are easy to write directly. Kept as a
  simple script on 2026-11-22; plugin evals are expected for the content skill later.

### Run each scenario against several models

* Good, because `AGT-04` asks for more than one agent, and a skill can behave differently on each.
* Bad, because it multiplies the cost of every run before one model passes reliably. One model for
  now, decided on 2026-11-21.

## More Information

**Follow-on obligations.** Each skill that gets evals needs its own fixtures drawn from a real
brand's saved context, a founder that cannot invent, and one check per rule. When a fixture's
source changes, the fixtures change with it.

**Reversal cost.** Low. The scripts stand alone, and moving to a framework or to every pull request
changes the workflow, not the skill.

Related: ADR-0024 (onboarding, which the brand sprint serves); ADR-0037 (the policy refresh, which
signs in to Anthropic from CI the same way).

## Open questions

* Whether a falling pass rate blocks a merge. `AGT-04` and `CNT-24` say a release whose scores fall
  does not ship; today nothing blocks.
* How a check that passes on one run and fails on the next is handled: rerun, run several times and
  take a rate, or accept one sample.
* When the content skill's evals (`CNT-24` to `CNT-26`) are built, and whether they use plugin evals.

## Revisit when

* The content skill's evals are built, or a second skill needs them.
* A merge ships a skill regression that a label run would have caught.
* The same check flips between pass and fail on unchanged code often enough to hide real
  regressions.
