---
status: "draft"
kind: "requirement-driven"
date: 2026-10-30
decision-makers: [Geoff]
---

# ADR-0025: The weekly review learns from each piece's signals and results, steering the next plan and proposing brand context changes, under one rule of evidence

**Requirements served:** `CNT-07`, `CNT-08`, `CNT-09`, `CNT-19`, `CNT-25`, `CNT-28`, `LOOP-02`.

## Context and Problem Statement

Every edit the person makes to a draft, every rejection with its reason, every approval and every
result is a signal (`CNT-07`). Changes to the brand context are proposed from those signals, each with
the signals behind it, and take effect only when the person approves (`CNT-08`), the same principle
as `LOOP-02`. The person sees every change and can undo any (`CNT-09`). Results are read weekly, per
piece, format and audience, so audiences learn as the voice does (`CNT-19`). Each week's plan is shaped
by the results so far, leaning towards what converted while still trying something new, and acting on
a difference only when enough pieces stand behind it (`CNT-28`). An eval shows the context improving
after a series of edits (`CNT-25`).

A signal is only useful if it is kept beside the draft it is about and the brand context version it
was written from, across conversations, on any surface. CMOkit's hosted services run no model, so
anything that reads signals and proposes a change in words runs in the person's own Claude.

A piece's result has two parts (ADR-0031). Its conversions are recorded by its destination and read
through an adapter, or reported by the person. Its attention, the views, saves and link taps the
platform shows, is reported by the person. The numbers are small: at five pieces a week for two
audiences in four formats, four weeks hold about five pieces per format and ten per audience, and one
piece that spreads widely can outweigh the rest.

## Decision Drivers

* Every signal is kept, whichever conversation or surface it arose in (`CNT-07`).
* A proposed change carries its evidence, and nothing changes without approval (`CNT-08`).
* A bad change is one step to undo (`CNT-09`).
* Results change what is made next, not only how it is written (`CNT-28`).
* A difference is acted on only when enough pieces stand behind it, so one piece cannot steer.
* The plan keeps trying new things, so the loop does not narrow too early.
* The person is asked for judgment once a week, not after every edit.
* No model runs in CMOkit's services.

## Considered Options

* Signals and results recorded with each piece on CMOkit's server; a weekly review in the person's
  Claude that steers the next plan and proposes brand context changes, both under one rule of evidence
* The same, steering on every result, with no minimum and no share kept for trying new things
* The same, with a statistical test for each comparison
* Brand context changes alone, with the plan made afresh each week
* Signals kept in Claude's memory, with Claude proposing changes when it notices a pattern
* Changes applied automatically when a pattern repeats, with undo

## Decision Outcome

Chosen option: "Signals and results recorded with each piece on CMOkit's server; a weekly review in
the person's Claude that steers the next plan and proposes brand context changes, both under one rule
of evidence", because results then change both what is made and how it is written, and the same small
rule keeps either from chasing one piece.

> **Signals.** When a piece's draft is shown, approved, rejected, edited or posted, the skill records
> it on the piece (ADR-0029): the draft, the words the person approved, the rejection's reason (one of
> a short list, and free text), the brand context version it was written from, and later its
> results.
>
> **Measure.** Conversions are a piece's main measure. Attention is the early signal, used when there
> are too few conversions to compare.
>
> **Rule of evidence.** The review compares the last four weeks by format and by audience, and by hook
> where pieces share one. It calls a difference only when each side has at least four pieces;
> otherwise it says it is too early to tell.
>
> **The plan.** Next week's plan, drafted by the weekly review (ADR-0021), leans towards the formats,
> audiences and hooks that converted under that rule, and keeps about one piece in five for trying
> something new. It is a draft the person approves, changes or declines, like any other.
>
> **The brand context.** The review also reads the week's signals with the current brand context and
> proposes at most three changes, each a difference to the context with the signals and results that
> support it, such as five edits that each shortened a hook, or an audience whose pieces converted at
> twice the other's. The person approves, changes or declines each; an approved change is saved as a
> new version with its reason and its evidence (ADR-0023). A change that results later contradict is
> proposed for undoing in a later review, and the person can restore any earlier version at any time.

### Consequences

* Good, because results change what is made next as well as how it is written.
* Good, because one piece that spreads widely cannot steer the plan or rewrite the voice alone.
* Good, because the context's history reads as a record of what the person taught it, with evidence.
* Bad, because at a few pieces a week, most comparisons are "too early to tell" for the first month.
* Bad, because a pattern the person shows on Monday is not learned until the weekly review.
* Bad, because edits made outside the conversation, such as in an editing app, are signals only if the
  person brings the final words back.

### Confirmation

The eval of `CNT-25` plays a scripted series of edits that share a pattern through recording and the
weekly review, and asserts that a proposed change names the pattern and cites those edits, and that
drafts written after it is approved need fewer edits. A second eval seeds four weeks of results and
asserts that the plan leans towards the format that converted, that about one piece in five tries
something new, and that with fewer than four pieces on a side the review says it is too early. Server
tests assert that no tool changes the brand context without an approval.

## Pros and Cons of the Options

### Signals and results recorded with each piece on CMOkit's server; a weekly review in the person's Claude that steers the next plan and proposes brand context changes, both under one rule of evidence

* Good, because it meets every driver.
* Bad, because the thresholds are judgment, not statistics, and are tuned by use.

### The same, steering on every result, with no minimum and no share kept for trying new things

* Good, because the plan reacts at once.
* Bad, because a single piece that spreads widely would steer every following week, and the plan
  would stop trying anything it has not already tried.

### The same, with a statistical test for each comparison

* Good, because a difference would carry a stated confidence.
* Bad, because at four to ten pieces a side a test rarely finds anything, and its precision would
  look more certain than the numbers are.

### Brand context changes alone, with the plan made afresh each week

* Good, because there is one lever to understand.
* Bad, because the plan, which formats and audiences get the week's pieces, is where results matter
  most, and it would never learn.

### Signals kept in Claude's memory, with Claude proposing changes when it notices a pattern

* Good, because it needs no server.
* Bad, because memory is free text Claude curates itself, so signals are lost or merged, carry no
  link to a piece or a context version, and results never reach it.

### Changes applied automatically when a pattern repeats, with undo

* Good, because the context improves with no effort from the person.
* Bad, because the brand context changes only with the person's approval (`CNT-08`).

## More Information

**Reversal cost.** Low: signals and results are kept either way, and the window, the minimum and the
share for trying new things are the skill's text.

## Revisit when

* People decline most proposed changes or plans, which says the proposals are wrong or too frequent.
* The eval of `CNT-25` shows no fall in edits after approved changes.
* Customers post enough that four weeks hold far more than four pieces a side, so a shorter window or
  a statistical test would learn faster.
* Across a quarter, the pieces kept for trying new things never produce a winner.
