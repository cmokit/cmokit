---
status: "proposed"
kind: "substrate"
date: 2026-11-07
decision-makers: [Geoff]
---

# ADR-0038: A pull request is opened ready for review, and merged only when a maintainer says so

## Context and Problem Statement

Every change to this repository is written by a model in a session, and one maintainer reviews it.
Nothing written down said what state a session should open a pull request in, or whether a session
may merge one, so sessions did whatever their own instructions said. Most opened pull requests ready
for review; some opened them as drafts. A draft says the work is unfinished, so when it is used as a
default the maintainer can no longer tell finished work from unfinished, and a draft cannot merge
until someone marks it ready.

## Decision Drivers

* One state means one thing to the maintainer.
* Nothing reaches `main` that the maintainer did not choose to merge.
* As little of the maintainer's attention as possible.
* No machinery the repository does not need yet.

## Considered Options

* Open ready for review and stop; merge only when a maintainer says so
* Open as a draft; the maintainer marks it ready and merges
* The session merges once CI passes
* A reviewing model approves, and a policy merges what it allows

## Decision Outcome

Chosen option: "Open ready for review and stop; merge only when a maintainer says so", because it
gives every open pull request one meaning, finished and waiting for the maintainer, and keeps the
decision to merge with a person.

> A session opens a pull request ready for review, never as a draft, once `npm run check` and
> `npm test` pass, and stops. It merges only when a maintainer tells it to.

### Consequences

* Good, because every open pull request is finished work waiting on one decision.
* Good, because nothing merges without a person choosing it.
* Bad, because work in progress has no shared place to be seen; it stays on its branch until done.

### Confirmation

Enforced by review: the maintainer is the one who decides to merge. Nothing in CI checks a pull
request's draft state.

## Pros and Cons of the Options

### Open ready for review and stop; merge only when a maintainer says so

* Good, because it meets every driver.
* Bad, because the maintainer is the only path to `main`, so pull requests wait while they are away.

### Open as a draft; the maintainer marks it ready and merges

* Good, because it marks work as unfinished until a person has looked.
* Bad, because a session's pull request is finished when it is opened, so the draft state carries no
  information and adds a step to every merge.

### The session merges once CI passes

* Good, because nothing waits on a person.
* Bad, because CI checks types, records and tests, not whether a change is wanted, so changes would
  land that nobody read.

### A reviewing model approves, and a policy merges what it allows

* Good, because routine changes, such as dependency updates, would stop needing a person.
* Bad, because it needs a review workflow, a policy, a ruleset and inference on every review, which
  this repository's volume of pull requests does not yet justify.

## More Information

**Reversal cost.** Low: it is a convention in `CLAUDE.md` and in how sessions are instructed.

## Revisit when

* Pull requests, dependency updates included, arrive faster than one maintainer can review them.
* A second maintainer gains write access.
