---
status: "proposed"
kind: "substrate"
date: 2026-10-11
decision-makers: [Geoff]
---

# ADR-0001: Documentation structure

## Context and Problem Statement

CMOkit is developed largely by agents and is meant to take contributors and adopters. Each kind of
writing it produces has a different reader and lifecycle: the vision changes rarely, requirements
churn until agreed, decisions churn until people depend on them, rules for an agent are read every
session, and adopters read guides without ever seeing the source. In one undifferentiated tree each
erodes the others, and a reader looking for what the engine does finds an argument about what it
might have done.

## Decision Drivers

* One home per kind of writing, chosen by reader and lifecycle.
* Decisions kept apart from descriptions of what is.
* A published standard for each kind where one exists.
* Metadata a check can read, so CI catches what review would otherwise have to.
* A document states what is true now. Reasoning goes in a decision record; how the thinking evolved
  goes nowhere.

## Considered Options

* A defined home per kind, each following a published standard
* One documentation tree for everything
* Diátaxis for the whole corpus
* No prescribed structure

## Decision Outcome

Chosen option: "A defined home per kind, each following a published standard", because it is the
only option that keeps decisions, requirements and guides from overwriting each other.

| Kind | Location | Standard |
|---|---|---|
| Entry point | `README.md` | — |
| Vision | `docs/product/vision.md` | — |
| Requirements | `docs/product/requirements.md`, stable domain-prefixed ids | — |
| Decision records | `docs/decisions/NNNN-*.md` | [MADR 4.0.0](https://adr.github.io/madr/) |
| Adopter documentation | `docs/tutorials/`, `docs/how-to/`, `docs/reference/`, `docs/explanation/` | [Diátaxis](https://diataxis.fr) |
| Agent and contributor rules | `CLAUDE.md` | — |

Directories arrive with their first document.

Decision records follow MADR 4.0.0 with three local rules: `Considered Options` and `Pros and Cons of
the Options` are mandatory; a `Revisit when` section names concrete triggers; and a record holds one
decision, tested by whether one clause could be superseded without reopening the others. Records are
numbered sequentially, carry a `status` and a `kind`, and are corrected in place when wrong.

A record's `kind` is `requirement-driven` when it would change if the requirements changed, and cites
the requirement ids it serves; otherwise it is `substrate` and cites none.

Derivation runs one way: vision → requirements → decision records → `CLAUDE.md` rules. A requirement
never cites a decision record, and the vision cites nothing.

### Consequences

* Good, because every document has one place and a reader knows what kind of claim it makes.
* Good, because adopters read the Diátaxis guides without wading through decision history.
* Bad, because a change to a rule touches its record as well as `CLAUDE.md`.

### Confirmation

A check in CI verifies that every record has a valid `status` and `kind`, that a requirement-driven
record cites only live requirement ids, that requirements cite no record, and that the index matches
the files.

## Pros and Cons of the Options

### A defined home per kind, each following a published standard

* Good, because each standard is documented elsewhere and needs no local explanation.
* Bad, because there are several places to learn.

### One documentation tree for everything

* Good, because there is one place to look.
* Bad, because decisions, requirements and guides interleave, and the reader cannot tell a rule from
  an argument.

### Diátaxis for the whole corpus

* Good, because it is a well-known standard.
* Bad, because it is a standard for user documentation and has no place for decisions or
  requirements.

### No prescribed structure

* Good, because it costs nothing up front.
* Bad, because every new document reopens where it goes, and agents answer differently each time.

## More Information

**Reversal cost.** Low while CMOkit has few documents; it rises with every adopter who links to one.

## Revisit when

* An adopter's documentation needs a kind of writing none of these homes holds.
