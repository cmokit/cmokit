---
status: "draft"
kind: "requirement-driven"
date: 2026-10-31
decision-makers: [Geoff]
---

# ADR-0036: A piece sent to a page the engine serves is measured by reading the site's own PostHog, read-only

**Requirements served:** `CNT-19`, `CNT-21`, `HST-04`, `HST-10`, `NFR-03`.

## Context and Problem Statement

A destination is always another system, and records a piece's conversions itself (ADR-0031). One of
the first two destinations is a landing page experiment's funnel page, on a site running CMOkit's
engine. The engine records the visitor's UTM parameters, including the piece's `utm_content`, and the
site's one conversion event in that site's PostHog, under the visitor's one identity (ADR-0010).
Results are read weekly per piece, format and audience (`CNT-19`), and a piece's link joins the
engine's measurement where it is present (`CNT-21`). Without a way to read them, those conversions
reach the content service only if the person copies them across.

PostHog's personal API keys can be scoped to one project and to `query:read`, which reads but
changes nothing (ADR-0013). The engine's own tools read PostHog from a coding agent's shell, for
experiments by variant, not per piece. A credential the customer gives CMOkit never passes through the
conversation (`HST-04`), and the reader sits behind an interface named for its job (`NFR-03`).

## Decision Drivers

* Funnel pieces are measured without the person copying numbers.
* CMOkit can change nothing in the customer's PostHog.
* The engine's packages are unchanged.
* Only counts per piece are kept, never a visitor's data.

## Considered Options

* A read-only analytics adapter for the site's own PostHog, with a key scoped to `query:read`
* The person reports funnel conversions from PostHog
* The engine sends each piece's conversions to the content server
* The coding-agent plugin's local MCP server reads them

## Decision Outcome

Chosen option: "A read-only analytics adapter for the site's own PostHog, with a key scoped to
`query:read`", because it reads what the engine already records, with a key that can change nothing,
and touches no package of the engine.

> For a piece whose destination is a page of a site running CMOkit's engine, the content server reads
> that site's analytics through an analytics-reading interface. Its first adapter is PostHog's. The
> customer gives, on CMOkit's page (ADR-0019), the project's id, a personal API key scoped to that
> project with `query:read` alone, and the name of the site's conversion event; the key is kept
> encrypted in the customer's object (ADR-0030). `results_read` counts, per piece, the visitors who
> first arrived with its `utm_content` and how many of them went on to send the conversion event, and
> keeps only the counts. The connection is optional: without it, the person reports those numbers.
> The content server never writes to PostHog.

### Consequences

* Good, because CMOkit's own pieces, sent to its own funnel, are measured with no copying.
* Good, because the key can read the project and nothing else, so a leaked key changes no experiment.
* Good, because the engine is unchanged: the content service reads what it already records.
* Bad, because CMOkit holds a second vendor's key for the customer.
* Bad, because a visitor is credited to the first piece that brought them, so a later piece that
  brought them back gets no credit.

### Confirmation

Tests run the adapter against recorded PostHog responses and assert the counts per piece, that no
visitor's identifier or property leaves it, and that it makes no call that writes. The boundary check
fails the build if a handler names PostHog; only the adapter does.

## Pros and Cons of the Options

### A read-only analytics adapter for the site's own PostHog, with a key scoped to `query:read`

* Good, because it meets every driver.
* Bad, because the customer creates and enters one more key.

### The person reports funnel conversions from PostHog

* Good, because it needs nothing built and no key.
* Bad, because the person filters PostHog by each piece's parameter every week, which few will keep
  doing, and the loop learns only from what they copy.

### The engine sends each piece's conversions to the content server

* Good, because conversions would arrive as they happen, with no key held by CMOkit.
* Bad, because it changes the engine's packages and makes the engine depend on the content service.

### The coding-agent plugin's local MCP server reads them

* Good, because that server already reads the customer's PostHog.
* Bad, because it runs only in a coding agent with the key in its shell, not in the person's chat,
  and it reads experiments by variant, not per piece.

## More Information

**Reversal cost.** Low: the adapter is optional, and dropping it returns funnel numbers to the person.

## Revisit when

* A site the customers run measures with an analytics tool other than PostHog.
* Customers want a later piece credited when it brings a visitor back.
