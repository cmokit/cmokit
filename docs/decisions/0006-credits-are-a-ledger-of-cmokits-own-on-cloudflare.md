---
status: "proposed"
kind: "requirement-driven"
date: 2026-10-24
decision-makers: [Geoff]
---

# ADR-0006: Credits are a ledger of CMOkit's own, in a Durable Object per customer, and all of CMOkit's storage is on Cloudflare

**Requirements served:** `CRD-01`, `CRD-02`, `CRD-03`, `CRD-04`, `CRD-05`, `CRD-06`, `CRD-08`, `CUS-02`, `SUB-06`, `PRD-04`, `NFR-04`, `NFR-06`, `AGT-06`.

## Context and Problem Statement

A customer's credit balance is state: credit grants from plans, top-ups and free trials, with their
expiry, rollover and priority (`CRD-02`), drawn down by usage events that must each count once
(`CRD-01`), and watched for a balance that falls low (`CRD-05`), is exhausted past the allowed overage
(`CRD-03`, `CRD-04`), or is restored. A user's usage may also be limited within the customer's shared
balance (`CRD-08`). Something has to keep it.

The rules are few. A balance is the customer's unexpired grants less its usage; a debit spends the
grant that expires first; each threshold is crossed or not. What makes it hard is order: two usage
events for one customer arriving together must not both spend its last credit, and a crossing must
be acted on once.

Nothing else keeps it well. Stripe's billing credits are an amount of money applied to an invoice
only when it is finalized, so the balance does not fall as usage arrives, and its alerts on a low
credit balance are an early-access preview. Billing tools that keep a running balance are either
commercial services, sitting between an adopter and its own Stripe account, or open-source servers
that need Kafka or always-on workers and so do not scale to zero (ADR-0012).

Every part of CMOkit must scale to zero (`NFR-06`), and its tests, and an agent running it locally,
need no account at any bought tool (`NFR-04`, `AGT-06`). Cloudflare already runs the edge.
A Durable Object is a single instance, addressed by name, that handles one request at a time over a
SQLite database of its own; it is billed for requests, rows and storage, not while idle, and is
offered on Workers' free plan.

## Decision Drivers

* A balance that falls as usage arrives, and an event when it is low, exhausted or restored
  (`CRD-03`, `CRD-05`).
* Two usage events for one customer can never both spend its last credit.
* Each usage event counts once, however often it is sent (`CRD-01`).
* Usage limits per user within a shared balance (`CRD-08`).
* Scales to zero, with no always-on server or database (`NFR-06`).
* No vendor between an adopter and its own payment processor.
* Testable and runnable locally with no account (`NFR-04`, `AGT-06`).

## Considered Options

* A ledger of CMOkit's own, in a Durable Object per customer
* A ledger of CMOkit's own, in one Cloudflare D1 database
* A billing tool that keeps running balances, behind an interface
* The payment processor's own billing credits

## Decision Outcome

Chosen option: "A ledger of CMOkit's own, in a Durable Object per customer", because one instance per
customer, handling one request at a time over its own SQLite database, makes every debit and every
crossing exact, and costs nothing while the customer is idle.

> **Units, not money.** The ledger counts credits in the product's own units. Money is the payment
> processor's (ADR-0012): a plan's renewal and a top-up are paid there, and their paid events become
> credit grants, keyed by the payment processor's own ids so a repeated event grants once. Usage past
> the balance, within the configured overage, is reported to the payment processor to be billed.
>
> **One Durable Object per customer.** It holds the customer's grants, with their expiry and priority,
> its usage events keyed by their idempotency keys, its users' limits and their usage in the current
> period, and the thresholds it has crossed. A usage event is one transaction: it is recorded once
> under its key, spends the grant that expires first, and compares the balance and the user's usage
> with every threshold. A threshold newly crossed adds an action — tell analytics and the billing
> contacts, block metered features, restore them — to an outbox in the same transaction, and the
> object's alarm delivers the outbox until each action is acknowledged. Every action sets a state, so
> delivering it twice is delivering it once.
>
> **All storage on Cloudflare.** The ledger is CMOkit's only store, and it runs on Cloudflare whichever
> runtime runs the rest of lifecycle work (ADR-0003). No package depends on a database client.
>
> **Written apart from its runtime.** The ledger's logic is written against a small SQL interface. The
> Durable Object's storage implements it in production, and Node's built-in SQLite in tests and local
> runs.

### Consequences

* Good, because nothing of CMOkit's runs or is billed while idle, and a small business's ledger fits
  Workers' free plan.
* Good, because every debit and every crossing is exact: no estimates from invoice previews, no
  window after which a repeated usage event counts twice.
* Good, because a product can ask for a customer's balance and get it at once, so a hard stop needs no
  extra tool.
* Good, because no vendor sits between an adopter and its Stripe account.
* Bad, because CMOkit owns the correctness of something access depends on, so the ledger's tests must
  cover repeated events, concurrent debits, expiry order and every crossing.
* Bad, because customers' balances and usage are held by Cloudflare even for a deployment that runs
  the rest of lifecycle work in its own cloud.
* Bad, because a usage event is kept as long as its key must be recognised, so a customer's storage
  grows with its usage, slowly.

### Confirmation

Ledger tests run on Node's built-in SQLite and replay a usage event twice, race two debits for the last
credit, spend grants across expiry, and cross each threshold down and back, asserting one action each.
The boundary check fails the build if any package depends on a database client.

## Pros and Cons of the Options

### A ledger of CMOkit's own, in a Durable Object per customer

* Good, because it meets every driver.
* Bad, because the ledger is CMOkit's to build and keep correct.

### A ledger of CMOkit's own, in one Cloudflare D1 database

* Good, because one database is simpler to query across customers.
* Bad, because D1 runs statements in batches, not interactive transactions, so reading a balance and
  debiting it cannot be one step, and two debits can both spend the last credit.

### A billing tool that keeps running balances, behind an interface

* Good, because the rules for grants, expiry and rollover are already built.
* Bad, because the tools that scale to zero are commercial services between an adopter and its Stripe
  account, and the open-source ones need always-on servers (ADR-0012).

### The payment processor's own billing credits

* Good, because there is no store beyond the payment processor.
* Bad, because credits are applied only when an invoice is finalized, so the balance would be
  estimated from previews of the coming invoice, behind meters counted asynchronously.
* Bad, because alerts on a low credit balance are an early-access preview, and a meter's limit of 100
  values of a dimension per customer caps usage by user (`CRD-08`).

## More Information

Source: Cloudflare's [Durable Objects pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/).

**Reversal cost.** Moderate: the ledger's logic stays, behind its SQL interface; another store needs an
adapter and a move of each customer's grants and usage. Nothing a product sends would change.

## Revisit when

* The payment processor keeps a running credit balance with events when it is low or exhausted.
* An adopter cannot keep customers' balances and usage on Cloudflare.
* Questions across customers, beyond what analytics answers, need a store that spans them.
