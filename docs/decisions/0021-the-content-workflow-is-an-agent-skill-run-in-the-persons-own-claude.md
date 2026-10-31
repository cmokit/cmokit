---
status: "draft"
kind: "requirement-driven"
date: 2026-10-30
decision-makers: [Geoff]
---

# ADR-0021: The content workflow and its opinions are an agent skill, run in the person's own Claude

**Requirements served:** `CNT-06`, `CNT-10`, `CNT-14`, `CNT-19`, `CNT-22`, `HST-08`, `HST-09`, `LOOP-01`.

## Context and Problem Statement

The content plugin plans a week of pieces backwards from what is sold (`CNT-10`), writes each in full
(`CNT-14`) from the brand context and checks it against the brand's voice before the person sees it
(`CNT-06`), and reads results weekly (`CNT-19`). The person works in claude.ai and the Claude mobile
app (`CNT-22`), from the Claude account they already have (`HST-08`), and CMOkit's hosted services run
no model (`HST-09`). Something has to carry the workflow and its opinions to wherever the person
works.

The vision says the loop is closed by an agent every week (`LOOP-01`). For the hosted offering that
raises two questions: whose agent, and how it runs on a schedule when CMOkit runs no model.

What Claude offers, from Anthropic's documentation: a skill is a folder of instructions and scripts
that Claude loads when a task calls for it, running in Claude's code sandbox, so code execution must
be on. A plugin bundles skills and connectors, is added on the web or the desktop app on paid plans,
and once added its skills and remote connectors work in chat on the web, desktop and mobile. Projects
carry instructions and knowledge files, but only a person with edit access changes them. Scheduled
tasks, on all paid plans, run a prompt hourly, daily or weekly in Anthropic's cloud, with no device
online, using the person's connectors and plugins, and can be created from any conversation.

## Decision Drivers

* The model work happens in the person's own Claude, never in CMOkit (`HST-09`).
* Works in chat on the web and on a phone (`CNT-22`).
* The opinions are versioned, open source and tested like code (`CNT-24`).
* The weekly run needs no one to remember it, and no model of CMOkit's.

## Considered Options

* An agent skill in a plugin, run in the person's own Claude, with the weekly run as a scheduled task
  in that Claude
* A Claude Project the person copies, with the workflow as its instructions
* The workflow as prompts served by CMOkit's MCP server
* A web app of CMOkit's own, with the workflow behind its screens

## Decision Outcome

Chosen option: "An agent skill in a plugin, run in the person's own Claude, with the weekly run as a
scheduled task in that Claude", because a skill is how Claude carries a workflow to every surface the
person uses, and a scheduled task runs it each week on the person's own plan.

> The content skill carries the workflow and its opinions: read the brand context; plan the week from
> what is being sold; write each piece (hook, timed beats, on-screen text, caption, call to action,
> shot list); ask for its visuals (ADR-0027); run the light check (ADR-0033); hand off for editing and
> posting (ADR-0028); and read results weekly (ADR-0025). It runs in the person's own Claude, and
> reaches CMOkit only through CMOkit's connector (ADR-0029). The weekly loop is closed by the
> person's own Claude: at setup the skill offers a weekly scheduled task that reads last week's
> results and drafts next week's plan, and the person approves what it drafted when they next open
> Claude. Without a scheduled task, the person starts the week themselves.

### Consequences

* Good, because CMOkit pays for no model, and the person's plan already covers the work.
* Good, because the opinions are a folder of text and scripts in this repository, reviewed, versioned
  and evaluated like any other code.
* Bad, because a skill needs code execution on and a paid Claude plan for plugins and scheduled tasks
  (ADR-0034).
* Bad, because the skill's behaviour depends on the model the person's Claude runs, which CMOkit does
  not choose; evals catch regressions only on the models they run against.
* Neutral, because a scheduled run drafts and never approves, so nothing changes without the person.

### Confirmation

Evals in CI run the skill against invented brands and score voice fidelity, AI tells and the content
opinions (`CNT-24`, `CNT-25`, `CNT-26`), and a release whose scores fall does not ship.

## Pros and Cons of the Options

### An agent skill in a plugin, run in the person's own Claude, with the weekly run as a scheduled task in that Claude

* Good, because it meets every driver.
* Bad, because it depends on Claude's plugin, skill and scheduled task features staying as they are.

### A Claude Project the person copies, with the workflow as its instructions

* Good, because a project's instructions apply to every chat in it, with nothing to install.
* Bad, because a project is copied, not installed, so a fix to the workflow never reaches the people
  using it.
* Bad, because instructions carry no scripts, so the deterministic parts of the check cannot run.

### The workflow as prompts served by CMOkit's MCP server

* Good, because a fix reaches everyone at once, with no plugin to update.
* Bad, because the person has to choose a prompt to start each step, and Claude cannot load it by
  itself when a task calls for it, as it does a skill.

### A web app of CMOkit's own, with the workflow behind its screens

* Good, because CMOkit would control every screen.
* Bad, because the writing would need a model, which `HST-09` rules out, or the person's Claude,
  which the app cannot reach.

## More Information

Sources: Anthropic's [skills overview](https://claude.com/docs/skills/overview),
[plugins overview](https://claude.com/docs/plugins/overview),
[plugin platform support](https://claude.com/docs/plugins/platform-support),
[projects](https://support.claude.com/en/articles/9517075-what-are-projects),
[scheduled tasks](https://support.claude.com/en/articles/13854387-schedule-recurring-tasks-in-claude-cowork)
and [Cowork on web, desktop and mobile](https://support.claude.com/en/articles/15520349-use-claude-cowork-on-web-desktop-and-mobile),
read on 2026-10-30.

**Reversal cost.** Low: the skill's text moves to whatever carries workflows next.

## Revisit when

* Claude's scheduled tasks stop being available on the plans solo creators use.
* Evals show the skill scoring differently enough across the models Claude offers that it must name
  one.
