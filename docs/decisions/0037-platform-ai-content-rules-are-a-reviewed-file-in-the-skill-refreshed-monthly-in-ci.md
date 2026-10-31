---
status: "draft"
kind: "requirement-driven"
date: 2026-10-31
decision-makers: [Geoff]
---

# ADR-0037: Platforms' rules on AI-made content are a reviewed file in the content skill, refreshed monthly by a model in CI that proposes a pull request

**Requirements served:** `CNT-18`, `CNT-29`, `CNT-30`, `HST-09`, `NFR-05`.

## Context and Problem Statement

Before a piece is drafted or scheduled, how its media was made is checked against each target
platform's current rules on content made with AI, and a prohibited use stops it from being scheduled
(`CNT-29`). The light check, which never blocks, no longer carries AI disclosure (`CNT-18`). The
rules change often: Instagram added an AI-generated profile label in August 2026, TikTok's community
guidelines were revised in August 2026, and Article 50 of the EU's AI Act applies from August 2026.
Many of the sources are news or vendor posts, and several platforms' own pages refuse automated
fetches. So each rule carries its own source, quoted evidence, date and status, and the rules are
checked every month by a process a person reviews (`CNT-30`).

The rules are the same for every customer, so checking them is one global job, not per-customer
inference: CMOkit's hosted services still run no model (`HST-09`), and each person's own Claude does
the per-piece work. The job needs the project's own model key, a secret of the CI environment
(`NFR-05`).

## Decision Drivers

* The rules reach every piece, in every person's Claude, with no server.
* Each rule says where it came from and how sure it is, so the skill never overstates it.
* A change to a rule is a diff a person reviews before anyone relies on it.
* No model is called in a month when nothing changed.
* The model that reads untrusted pages can change nothing but the two data files.

## Considered Options

* A plain markdown file in the skill, with a sources file beside it; a monthly CI job that hashes
  each source's main text and, only when something changed, runs Claude Code to update the file and
  opens a pull request
* The rules written into the skill's own instructions, updated by hand
* The rules served by the content server, from storage
* No stored rules: each person's Claude looks up the platforms' pages every time
* A monthly job that only detects changes and alerts a maintainer, with no model

## Decision Outcome

Chosen option: "A plain markdown file in the skill, with a sources file beside it; a monthly CI job
that hashes each source's main text and, only when something changed, runs Claude Code to update
the file and opens a pull request", because it keeps the rules where the skill reads them, makes
every change a reviewed diff, and spends a model call only when a source moved.

> `references/ai-content-policies.md` in the content skill holds the asset levels and one entry per
> rule, each with its source, quoted evidence, `verified_on` and `status`; `policy-sources.json`
> lists the monitored pages with a hash of each one's main text. The skill reads the file before a
> piece is drafted or scheduled, adds an AI check to each piece, stops scheduling on a prohibited
> use, and says when a rule is stale or unverified. On the 1st of each month, and by hand, a
> workflow runs `scripts/policy-refresh.ts`, which fetches each page, hashes its main text, and
> marks a page it cannot read unfetchable. If nothing changed and every entry is current, it stops.
> Otherwise Claude Code, pinned by commit and given read-only repository access and no shell,
> follows `references/REFRESH.md` to update only what the sources say. A second job, with no model,
> opens a pull request; nothing is pushed to the default branch or merged by the workflow.

### Consequences

* Good, because the rules travel with the skill and need no server, connector or store.
* Good, because every change to a rule is reviewed with its evidence before it ships.
* Good, because a quiet month costs no model call.
* Bad, because a person's rules are as current as their copy of the plugin.
* Bad, because pages that refuse automated fetches stay unfetchable for the script, and the model's
  own fetch may fail too, so some entries need a person to read them.
* Bad, because a pull request opened with the workflow's own token does not start other workflows,
  so CI runs on it only when a maintainer pushes to it or reopens it.

### Confirmation

Tests of `scripts/policy-refresh.ts` assert that navigation and scripts do not change a page's
hash, that a changed main text is detected, that an unreadable page is unfetchable and keeps its
last hash, and that the model step runs only when something changed or is pending. The workflow's
permissions are checked in review.

## Pros and Cons of the Options

### A plain markdown file in the skill, with a sources file beside it; a monthly CI job that hashes each source's main text and, only when something changed, runs Claude Code to update the file and opens a pull request

* Good, because it meets every driver.
* Bad, because the model step depends on the project's own model key and its cost.

### The rules written into the skill's own instructions, updated by hand

* Good, because there is nothing to run.
* Bad, because nothing notices when a platform changes a rule, and prose carries no provenance or
  status for the skill to report.

### The rules served by the content server, from storage

* Good, because a change would reach everyone at once, without a plugin update.
* Bad, because it adds a store and a tool for data that is the same for everyone, and the skill
  would fail without the connector.

### No stored rules: each person's Claude looks up the platforms' pages every time

* Good, because the rules would always be as fresh as the pages.
* Bad, because every piece would cost every person a search, results would vary, and pages that
  refuse fetches would leave nothing at all.

### A monthly job that only detects changes and alerts a maintainer, with no model

* Good, because it needs no model key.
* Bad, because a maintainer then reads every changed page and edits every entry by hand each month.

## More Information

Sources: Anthropic's [claude-code-action](https://github.com/anthropics/claude-code-action), read at
v1.0.266, and Claude Code's [model configuration](https://code.claude.com/docs/en/model-config).

**Follow-on obligations.** The repository secret `ANTHROPIC_API_KEY`, the project's own; the
repository setting that lets GitHub Actions create pull requests; and the plugin's manifest, which
ADR-0022 describes.

**Reversal cost.** Low: the data file stands on its own, and the workflow can be removed without
touching it.

## Revisit when

* Most entries stay unfetchable for two refreshes running, so the fetch needs another route.
* The rules change more often than monthly for the platforms customers use.
* A platform publishes its AI rules in a form meant for machines to read.
