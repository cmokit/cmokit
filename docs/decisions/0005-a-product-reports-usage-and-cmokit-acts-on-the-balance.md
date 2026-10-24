---
status: "proposed"
kind: "requirement-driven"
date: 2026-10-11
decision-makers: [Geoff]
---

# ADR-0005: A product reports usage to CMOkit, which debits the customer's credit ledger and acts on its balance

**Requirements served:** `CUS-02`, `CRD-01`, `CRD-02`, `CRD-03`, `CRD-04`, `CRD-05`, `CRD-06`, `MSR-07`, `PRD-02`.

## Context and Problem Statement

A product that pays for inference sells credits: a plan grants some each billing period, a top-up
grants more, and every user's usage draws down the customer's shared credit balance. When the balance
is exhausted, past a configured overage, the customer's metered features are blocked, and a credit
grant that restores the balance restores them.

Credit grants start at the payment processor, which CMOkit already hears from. Usage starts in the
product, which is the only party that sees it. The credit balance itself is kept by CMOkit's ledger
(ADR-0006). Usage must also reach analytics against the user, so that margin by channel and variant
can be read (`MSR-07`) and usage is readable per user (`CRD-06`). Someone has to carry usage from the
product to the ledger and to analytics, and someone has to block and restore the customer's metered
features as its balance changes.

Usage is far more frequent than lifecycle events: a call to a model can happen many times a minute
for one user.

## Decision Drivers

* No code specific to one product in CMOkit, and as little as possible built by each product
  (`PRD-02`).
* Credit rules are configuration (`CRD-02`), held in one place.
* Usage is counted per user and accounted to the customer that pays (`CUS-02`, `CRD-06`).
* Acting on a usage event twice has the effect of acting once (`CRD-01`).
* A product depends on no payment vendor's API (`NFR-03`).

## Considered Options

* The product sends CMOkit usage events; CMOkit debits them from the customer's ledger and records them
  in analytics, and makes the configured calls when the balance falls low, is exhausted or is restored
* The product checks and debits a balance itself before each call
* The product keeps the balance and enforces it; CMOkit only tells it of credit grants

## Decision Outcome

Chosen option: "The product sends CMOkit usage events; CMOkit debits them from the customer's ledger
and records them in analytics, and makes the configured calls when the balance falls low, is
exhausted or is restored", because it asks each product only to report what it alone can see,
through one interface that names no vendor.

> A product sends CMOkit usage events, each signed with a secret the deployment supplies, naming the
> user, the customer, a quantity, the period it covers and an idempotency key. The product aggregates
> usage over a short period and does not send one event per call. CMOkit debits each event from the
> customer's ledger under its idempotency key, and records it in analytics against the user. When the
> balance falls below its configured threshold, CMOkit tells analytics and the customer's billing
> contacts. When it is exhausted past the configured overage, CMOkit makes the configured call that
> blocks the customer's metered features; when a credit grant restores the balance, the call that
> restores them. Usage past the balance, within the overage, is billed through the payment processor
> (ADR-0012). Usage is the only thing a product sends CMOkit.

### Consequences

* Good, because a product builds one signed sender, not a ledger, its rules and its messaging.
* Good, because a user's usage in analytics and the customer's balance in the ledger come from the
  same events.
* Good, because blocking and restoring reuse the configured calls of ADR-0004.
* Bad, because blocking is never instant. A customer can use what it sends between its balance being
  exhausted and the blocking call landing, which is at most the product's aggregation period and the
  call; the configured overage (`CRD-04`) covers it.
* Bad, because a product must sign, retry and deliver its usage events, a second interface it
  publishes.

### Confirmation

Tests replay a usage event twice and assert one debit under one key; drive a balance low, exhausted
and restored and assert one message, one blocking call and one restoring call. They run against
stand-ins for the product, the payment processor and analytics, with no account at any bought tool
(`NFR-04`).

## Pros and Cons of the Options

### The product sends CMOkit usage events; CMOkit debits them from the customer's ledger and records them in analytics, and makes the configured calls when the balance falls low, is exhausted or is restored

* Good, because it meets every driver.
* Bad, because it allows an overage between exhaustion and blocking.

### The product checks and debits a balance itself before each call

* Good, because the product can refuse a call the instant the balance reaches zero, with no overage.
* Bad, because a check on every call puts CMOkit in the path of every use of the product, so a slow
  or unreachable ledger slows or stops the product.
* Bad, because usage then reaches analytics only if the product also sends it there.

### The product keeps the balance and enforces it; CMOkit only tells it of credit grants

* Good, because the product can stop a call the instant the balance reaches zero.
* Bad, because every product builds a ledger, the rules for rollover and expiry, and its own
  low-balance messaging, and each builds them differently.
* Bad, because usage never reaches CMOkit, so margin by channel and per-user usage need the product to
  send it somewhere anyway.

## More Information

**Reversal cost.** Low: a product that needs no overage can also read the customer's balance from the
ledger, which is an addition to this interface, not a change to it.

## Revisit when

* Adopters routinely need an overage smaller than their aggregation period allows.
* Products ask to check a balance before each call rather than be told when it is exhausted.
