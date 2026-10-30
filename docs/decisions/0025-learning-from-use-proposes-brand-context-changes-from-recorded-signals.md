---
status: "draft"
kind: "requirement-driven"
date: 2026-10-30
decision-makers: [Geoff]
---

# ADR-0025: Learning from use records each piece's signals on CMOkit's server, and the weekly review proposes brand context changes the person approves

**Requirements served:** `CNT-07`, `CNT-08`, `CNT-09`, `CNT-19`, `CNT-25`, `LOOP-02`.

## Context and Problem Statement

Every edit the person makes to a draft, every rejection with its reason, every approval and every
result is a signal (`CNT-07`). Changes to the brand context are proposed from those signals, each with
the signals behind it, and take effect only when the person approves (`CNT-08`), the same principle
as `LOOP-02`. The person sees every change and can undo any (`CNT-09`). Results are read weekly, per
piece, format and audience, so audiences learn as the voice does (`CNT-19`). An eval shows the context
improving after a series of edits (`CNT-25`).

A signal is only useful if it is kept beside the draft it is about and the brand context version it
was written from, across conversations, on any surface. CMOkit's hosted services run no model, so
anything that reads signals and proposes a change in words runs in the person's own Claude.

## Decision Drivers

* Every signal is kept, whichever conversation or surface it arose in (`CNT-07`).
* A proposed change carries its evidence, and nothing changes without approval (`CNT-08`).
* A bad change is one step to undo (`CNT-09`).
* The person is asked to approve a few changes a week, not one per edit.
* No model runs in CMOkit's services.

## Considered Options

* Signals recorded with each piece on CMOkit's server; the weekly review in the person's Claude
  proposes a few changes, each with its evidence, and the person approves each
* The same, but proposing a change after every edit
* Signals kept in Claude's memory, with Claude proposing changes when it notices a pattern
* Changes applied automatically when a pattern repeats, with undo

## Decision Outcome

Chosen option: "Signals recorded with each piece on CMOkit's server; the weekly review in the
person's Claude proposes a few changes, each with its evidence, and the person approves each",
because it keeps every signal next to its piece and its context version, and asks the person for
judgment once a week.

> When a piece's draft is shown, approved, rejected, edited or posted, the skill records it on the
> piece (ADR-0029): the draft, the words the person approved, the rejection's reason (one of a short
> list, and free text), the brand context version it was written from, and later its results. These
> are the signals. Each week, in the review, the skill reads the week's signals with the current
> brand context and proposes at most three changes, each a difference to the context with the
> signals that support it, such as five edits that each shortened a hook. The person approves,
> changes or declines each; an approved change is saved as a new version with its reason and its
> signals (ADR-0023). A change that results later contradict is proposed for undoing in a later
> review, and the person can restore any earlier version at any time. Results are read per piece,
> format and audience, so an audience's description changes by the same route as the voice.

### Consequences

* Good, because the context's history reads as a record of what the person taught it, with evidence.
* Good, because a week's edits are judged together, so one odd edit does not rewrite the voice.
* Bad, because a pattern the person shows on Monday is not learned until the weekly review.
* Bad, because edits made outside the conversation, such as in an editing app, are signals only if the
  person brings the final words back.

### Confirmation

The eval of `CNT-25` plays a scripted series of edits that share a pattern through recording and the
weekly review, and asserts that a proposed change names the pattern and cites those edits, and that
drafts written after it is approved need fewer edits. Server tests assert that no tool changes the
brand context without an approval.

## Pros and Cons of the Options

### Signals recorded with each piece on CMOkit's server; the weekly review in the person's Claude proposes a few changes, each with its evidence, and the person approves each

* Good, because it meets every driver.
* Bad, because the server keeps every draft and its edits, which grows with use.

### The same, but proposing a change after every edit

* Good, because the context learns at once.
* Bad, because the person is asked to approve something after every edit, and one edit is rarely a
  pattern.

### Signals kept in Claude's memory, with Claude proposing changes when it notices a pattern

* Good, because it needs no server.
* Bad, because memory is free text Claude curates itself, so signals are lost or merged, carry no
  link to a piece or a context version, and results never reach it.

### Changes applied automatically when a pattern repeats, with undo

* Good, because the context improves with no effort from the person.
* Bad, because the brand context changes only with the person's approval (`CNT-08`).

## More Information

**Reversal cost.** Low: signals are kept either way, and how often changes are proposed is the
skill's text.

## Revisit when

* People decline most proposed changes, which says the proposals are wrong or too frequent.
* The eval of `CNT-25` shows no fall in edits after approved changes.
