---
status: "proposed"
kind: "requirement-driven"
date: 2026-10-11
decision-makers: [Geoff]
---

# ADR-0005: A product reports usage to CMOkit, and CMOkit decides when credits run out

**Requirements served:** `ENT-02`, `CRD-01`, `CRD-02`, `CRD-03`, `CRD-04`, `CRD-05`, `CRD-06`, `PRD-02`.

## Context and Problem Statement

A product that pays for inference sells credits: a plan grants some each period, a top-up pack
grants more, and every member's use draws them down from the entity's pooled balance. When the
balance runs out the entity is suspended, and a grant that restores it resumes the entity.

Grants start at the payment processor, which CMOkit already hears from. Usage starts in the product,
which is the only party that sees it. Someone has to hold the rules — what each plan and pack
grants, how credits roll over and expire, how far past zero an entity may run — and decide when an
entity's credits are gone.

The payment processor cannot be that party. Stripe, for one, applies billing credits when an invoice
is finalized rather than as usage arrives, and its usage alerts fire at a fixed threshold that would
have to be reset at every grant. Neither gives a running balance that can trigger a suspension.

Usage is far more frequent than lifecycle events: a call to a model can happen many times a minute
for one member.

## Decision Drivers

* No code specific to one product in CMOkit, and as little as possible built by each product
  (`PRD-02`).
* Credit rules are configuration (`CRD-02`), held in one place.
* Usage is counted per member and accounted to the entity that pays (`ENT-02`, `CRD-06`).
* Acting on a usage event twice has the effect of acting once (`CRD-01`).
* No vendor's billing features are required beyond charging, metering and invoicing (`NFR-03`).

## Considered Options

* The product sends CMOkit signed, rolled-up usage events; CMOkit keeps the balance and makes the
  configured suspend call
* The product keeps the balance and enforces it; CMOkit only tells it of grants
* The product reports usage to the processor's meter; the processor's alerts trigger suspension

## Decision Outcome

Chosen option: "The product sends CMOkit signed, rolled-up usage events; CMOkit keeps the balance and
makes the configured suspend call", because it keeps the credit rules in one configured place and
asks each product only to report what it alone can see.

> A product sends CMOkit usage events, each signed with a secret the deployment supplies, naming the
> member, the entity billed, a quantity, the period it covers and an idempotency key. The product
> rolls usage up over a short period and does not send one event per call. CMOkit debits the entity's
> balance once per key, reports the usage to the processor's meter for invoicing, and sends it to
> analytics against the member. When a balance falls below its configured threshold, CMOkit tells
> analytics and the entity's billing contacts. When it passes the configured overrun, CMOkit makes the
> configured suspend call for the entity. A grant that restores the balance makes the resume call.
> Usage is the only thing a product sends CMOkit, and the usage endpoint accepts traffic from inside
> the product's boundary only.

### Consequences

* Good, because a product builds one signed sender, not a ledger, its rules and its messaging.
* Good, because a member's usage and the entity's balance come from the same events, so they agree.
* Good, because suspend and resume reuse the configured lifecycle calls of ADR-0004.
* Bad, because suspension is never instant. An entity can use what it sends between its credits
  running out and the suspend call landing; the configured overrun (`CRD-04`) states how much.
  A product that can afford none also enforces a cap of its own.
* Bad, because CMOkit now keeps state: balances and the keys it has acted on (ADR-0006).
* Bad, because a product must sign, retry and deliver its usage events, a second interface it
  publishes.

### Confirmation

Tests replay a usage event twice and assert one debit; drive a balance through its threshold and past
its overrun and assert one low-balance event and one suspend call; and replay a top-up and assert one
grant and one resume call. They run against a stand-in product and processor, with no account at any
bought tool (`NFR-04`).

## Pros and Cons of the Options

### The product sends CMOkit signed, rolled-up usage events; CMOkit keeps the balance and makes the configured suspend call

* Good, because it meets every driver.
* Bad, because it allows an overrun between exhaustion and suspension.

### The product keeps the balance and enforces it; CMOkit only tells it of grants

* Good, because the product can stop a call the instant the balance reaches zero, with no overrun.
* Good, because CMOkit keeps no state.
* Bad, because every product builds a ledger, the rules for rollover and expiry, and its own
  low-balance messaging, and each builds them differently.
* Bad, because usage never reaches CMOkit, so margin by channel and per-member usage need the
  product to send it somewhere anyway.

### The product reports usage to the processor's meter; the processor's alerts trigger suspension

* Good, because the processor already meters and invoices usage, and CMOkit keeps no state.
* Bad, because a processor's credits and alerts are not a running balance: credits are applied at
  invoicing, and alerts fire at fixed thresholds reset by hand at every grant.
* Bad, because it requires one processor's billing features, so the payments interface could no
  longer be met by another vendor (`NFR-03`).

## More Information

**Reversal cost.** Moderate. Moving the balance into each product would mean every product builds a
ledger. Moving it to a processor that offers a real running balance would change only CMOkit.

## Revisit when

* A payment processor offers a running credit balance with an event when it is exhausted.
* Adopters routinely need an overrun smaller than their usage period allows.
