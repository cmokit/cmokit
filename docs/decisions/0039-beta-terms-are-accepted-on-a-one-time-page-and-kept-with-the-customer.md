---
status: "proposed"
kind: "requirement-driven"
date: 2026-11-10
decision-makers: [Geoff]
---

# ADR-0039: Beta terms are accepted on a one-time page the conversation links to, and kept with the customer

**Requirements served:** `HST-15`, `HST-03`, `HST-10`, `HST-11`, `HST-13`.

## Context and Problem Statement

While hosted CMOkit is in a closed beta, every user accepts its beta terms before using it, and
accepts each new version again (`HST-15`). Setup is a conversation in the person's own Claude
(`HST-03`), so the person has to be shown the terms and accept them from there. Something has to say
where acceptance happens, where it is kept and what a user who has not accepted can still do. The
terms themselves are written and published by CMOkit's operator; this record is about recording
their acceptance, not their text.

## Decision Drivers

* Acceptance is the person's own act, not something a model says on their behalf.
* It works at the hosted address, with no step outside the conversation but the one link.
* It is kept per customer, apart from every other's (`HST-10`), and leaves with its export
  (`HST-13`).
* A self-hosted server asks for no terms unless its operator sets some (`HST-11`).
* Nothing new to run: the content server's own pages and Durable Objects (ADR-0019, ADR-0030).

## Considered Options

* A one-time page of the content server's, linked from account_status, with acceptance kept in the
  customer's Durable Object
* A consent step on the issuer's sign-in page
* A box to tick on the waitlist form
* A tool the person's Claude calls to accept

## Decision Outcome

Chosen option: "A one-time page of the content server's, linked from account_status, with
acceptance kept in the customer's Durable Object", because it reuses the one-time link the server
already gives for a vendor's key, and the person clicks Accept themselves.

> The content server takes the terms' address and current version as two variables, and asks for
> nothing when either is unset. A user who has not accepted the current version is offered
> account_status alone, as a lapsed customer is; every other tool refuses and points to it.
> account_status lists the terms first among what is missing, with their address and a one-time
> link, good for 15 minutes, to a page of the server's that links to the terms and has a box to tick
> and an Accept button. Accepting records the person, the version and the time in the customer's
> Durable Object and uses the link up. The record is in the customer's export. A new version is
> accepted again.

### Consequences

* Good, because acceptance is a click by the person, on CMOkit's own page, with the terms linked.
* Good, because it needs no change to the issuer, the waitlist or the skill.
* Bad, because a person who is a user of two customers accepts once for each.
* Neutral, because the terms are published elsewhere, at the address the variable names, and the
  server holds no copy of their text.

### Confirmation

A test of the content server asserts that a user who has not accepted is offered account_status
alone, that its link accepts once and only with the box ticked, that a terms link connects nothing,
and that a new version is asked for again.

## Pros and Cons of the Options

### A one-time page of the content server's, linked from account_status, with acceptance kept in the customer's Durable Object

* Good, because it meets every driver.
* Bad, because acceptance is per customer rather than per person.

### A consent step on the issuer's sign-in page

* Good, because it would be met once per person, at sign-in.
* Bad, because the issuer serves every product on the server, not only those in a beta, and it would
  keep a record about a person that no customer's export carries.

### A box to tick on the waitlist form

* Good, because it costs the person nothing extra.
* Bad, because joining a waitlist is not using the product, the terms may change before a person is
  activated, and an operator's own list (ADR-0017) never sees the form.

### A tool the person's Claude calls to accept

* Good, because it never leaves the conversation.
* Bad, because the model, not the person, would be the one saying yes.

## More Information

**Follow-on obligations.** The deployment reference names the two variables, and the operator
publishes the terms at the address it sets.

**Reversal cost.** Low: the gate is one check in the server, and the record is one table.

## Revisit when

* The closed beta ends, and the terms become the service's ordinary terms of use.
* A person regularly belongs to several customers, so per-person acceptance is worth its cost.
