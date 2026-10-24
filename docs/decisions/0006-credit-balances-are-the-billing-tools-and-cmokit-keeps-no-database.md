---
status: "proposed"
kind: "requirement-driven"
date: 2026-10-11
decision-makers: [Geoff]
---

# ADR-0006: Credit balances are kept by the billing tool, and CMOkit keeps no database

**Requirements served:** `CRD-01`, `CRD-02`, `CRD-03`, `CRD-05`, `CRD-08`, `SUB-06`, `NFR-02`, `NFR-04`, `NFR-06`, `AGT-06`.

## Context and Problem Statement

A customer's credit balance is state: credit grants from plans, top-ups and free trials, with their
expiry, rollover and priority (`CRD-02`), drawn down by usage events that must each count once
(`CRD-01`), and watched for a low or exhausted balance (`CRD-03`, `CRD-05`). Every other piece of
CMOkit's state already lives in a bought tool: subscriptions and invoices at the billing tool and
payment processor, identity and assignments in analytics, the customer's own record in the product.
Something has to keep the balance.

Every part of CMOkit must scale to zero (`NFR-06`), and lifecycle work runs as a Cloudflare Worker or
as a container that scales to zero (ADR-0003). Its tests, and an agent running it locally, need no
account at any bought tool (`NFR-04`, `AGT-06`). Products differ in the database they run, and many
small businesses run none that CMOkit could share.

Acting on the billing tool's webhook events twice must have the effect of acting once (`SUB-06`). The
actions CMOkit takes on them — give access, revoke it, block or restore metered features — set a
state in the product, so repeating one changes nothing.

Payment processors' own credits do not keep a running balance. Stripe's billing credits are an amount
of money applied to an invoice only when it is finalized, normally at the end of a billing period,
so the available balance does not fall as usage arrives. Its alerts on a low credit balance are an
early-access preview, and a meter accepts at most 100 distinct values of a dimension per customer,
which caps usage by user. Billing tools built for usage-based pricing — Autumn, Flexprice, OpenMeter
and Lago among them — keep a running balance, check it in real time and send an event when it falls
below a threshold or is exhausted.

## Decision Drivers

* Scales to zero, with no always-on server or database (`NFR-06`).
* A balance that falls as usage arrives, with an event when it is low or exhausted (`CRD-03`,
  `CRD-05`).
* Each usage event counts once (`CRD-01`).
* Usage limits per user within a shared balance (`CRD-08`).
* Nothing CMOkit builds is a ledger.
* Testable and runnable locally with no account (`NFR-04`, `AGT-06`).

## Considered Options

* A billing tool that keeps running credit balances, behind CMOkit's billing interface; CMOkit keeps no
  database
* The payment processor's own billing credits; CMOkit keeps no database
* A ledger of CMOkit's own, in a store that scales to zero, such as Cloudflare D1
* A ledger of CMOkit's own, in a Postgres database on the product's existing instance

## Decision Outcome

Chosen option: "A billing tool that keeps running credit balances, behind CMOkit's billing
interface; CMOkit keeps no database", because it is the only option that gives a running balance
without CMOkit building a ledger or running a database.

> CMOkit keeps no database. Credit grants, credit balances and usage are kept by the billing tool,
> reached through CMOkit's billing interface. CMOkit records usage there under each event's
> idempotency key, and acts on the tool's webhook events by setting a state in the product, so acting
> twice has the effect of acting once. Tests and local runs use a stand-in for the billing interface.

### Consequences

* Good, because nothing of CMOkit's runs or is billed while idle, and nothing needs backing up.
* Good, because the rules for grants, expiry, rollover and priority are the billing tool's, which
  already has them.
* Good, because lifecycle work can move between a Worker and a container with nothing to migrate.
* Bad, because a third bought tool sits beside analytics and the payment processor, and holds the
  balance on which access depends.
* Bad, because duplicate usage is caught only within the billing tool's idempotency window, so the
  product's retries must end within it.

### Confirmation

The boundary check fails the build if any package depends on a database client. Lifecycle tests run
against the stand-in billing interface with no account at any bought tool.

## Pros and Cons of the Options

### A billing tool that keeps running credit balances, behind CMOkit's billing interface; CMOkit keeps no database

* Good, because it meets every driver.
* Bad, because it adds a vendor and a monthly charge once a business outgrows the tool's free tier.

### The payment processor's own billing credits; CMOkit keeps no database

* Good, because there is no tool beyond the processor.
* Bad, because credits are applied only when an invoice is finalized, so CMOkit would have to
  estimate the balance from previews of the coming invoice, behind meters that are counted
  asynchronously.
* Bad, because alerts on a low credit balance are an early-access preview, and a dimension's limit of
  100 values per customer caps per-user usage (`CRD-08`).

### A ledger of CMOkit's own, in a store that scales to zero, such as Cloudflare D1

* Good, because CMOkit controls the balance exactly, with no added vendor.
* Bad, because CMOkit builds and maintains a ledger with expiry, rollover and priority that billing
  tools already offer.
* Bad, because a container deployment inside an audited boundary needs a second store, since D1 is
  reached only from a Worker.

### A ledger of CMOkit's own, in a Postgres database on the product's existing instance

* Good, because a product that runs Postgres adds a database at no added cost.
* Bad, because many products run no Postgres, and many small businesses no database CMOkit could
  share.
* Bad, because a Postgres instance does not scale to zero, and it is reached from a Worker only over
  the internet.

## More Information

**Reversal cost.** Moderate. A ledger of CMOkit's own would be a second implementation of the billing
interface, with a store and migrations behind it; nothing a product sends would change.

## Revisit when

* A payment processor keeps a running credit balance with an event when it is low or exhausted, so the
  billing tool can be dropped.
* No billing tool that scales to zero in cost meets the drivers.
* CMOkit needs to keep state that no bought tool holds.
