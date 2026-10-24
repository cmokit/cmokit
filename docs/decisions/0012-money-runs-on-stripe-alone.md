---
status: "proposed"
kind: "requirement-driven"
date: 2026-10-24
decision-makers: [Geoff]
---

# ADR-0012: Money runs on Stripe alone, behind a payments interface

**Requirements served:** `SUB-01`, `SUB-02`, `SUB-03`, `SUB-04`, `SUB-05`, `SUB-06`, `CUS-01`, `CUS-03`, `CRD-04`, `CRD-07`, `NFR-03`, `NFR-06`.

## Context and Problem Statement

Credits are counted by CMOkit's own ledger (ADR-0006). Everything else in the subscription lifecycle
is money: a free trial started in a hosted checkout (`SUB-01`) that converts to a subscription
(`SUB-02`), invoices, charges, dunning after a failed payment, a customer portal (`SUB-03`), top-ups
bought from a link (`CRD-07`), and overage billed when usage passes the balance (`CRD-04`). Card risk
is not worth owning, so a payment processor does all of it, and its events drive access (`SUB-04`).

Stripe does all of it, for a share of what it bills (Billing adds 0.7% to card fees) and no monthly
fee: Checkout, Billing's subscriptions and invoices, Smart Retries and dunning, the customer portal,
meters for usage billed in arrears, and billing thresholds that invoice early once usage reaches an
amount. The question is whether a billing tool should sit
on top of it. The candidates, as their own documentation stood on 2026-10-24:

| | Autumn | Flexprice | OpenMeter | Lago |
|---|---|---|---|---|
| What it is | Commercial hosted service over Stripe | Open source (AGPL), or hosted | Open source (Apache-2.0), hosted as Kong Konnect | Open source (AGPL), or hosted |
| Hosted, low volume | Free up to $8K monthly billing volume; Pro $375 a month | $199 a month and 0.5% of billing | $20 per million events and 0.4% of billing | Price on request |
| Self-hosted | Not offered: its source repository is no longer public | Postgres, Kafka, ClickHouse, Redis, Temporal | Kafka, ClickHouse, Postgres | Postgres, Redis, workers |
| Stripe Billing | Kept | Replaced; Stripe for payments | Replaced; invoices synced to Stripe | Replaced; Stripe for payments |

## Decision Drivers

* Nothing to pay while a business is small beyond the payment processor's own fees (`NFR-06`).
* No vendor between an adopter and its own payment processor.
* Hosted checkout, dunning and a customer portal, none of them built (`SUB-01`, `SUB-03`).
* Swappable behind an interface named for the job (`NFR-03`).

## Considered Options

* Stripe alone, with credits in CMOkit's ledger
* Autumn, over Stripe Billing
* OpenMeter, as Kong Konnect Metering & Billing
* Flexprice
* Lago

## Decision Outcome

Chosen option: "Stripe alone, with credits in CMOkit's ledger", because it is the only option that adds
neither a vendor nor an always-on server, and the one thing the billing tools add, a running credit
balance, is CMOkit's own (ADR-0006).

> The payments interface is implemented by one adapter, for Stripe. Plans, prices, trial length and
> the grace period are configured in Stripe from CMOkit's configuration (`SUB-05`). A customer in
> CMOkit is one Stripe customer (`CUS-01`), created at its first checkout (`CUS-03`). The lifecycle
> verifies each Stripe webhook event before acting on it, and acts by setting a state, so an event
> delivered twice acts once (`SUB-06`). A paid renewal or top-up becomes a credit grant in the ledger;
> usage past the balance, within the configured overage, is reported to a Stripe meter and billed on
> the next invoice, and a billing threshold charges early once it reaches the configured amount. No
> handler names Stripe; only the adapter does.

### Consequences

* Good, because a small business pays Stripe's fees and nothing else.
* Good, because an adopter keeps the Stripe account, prices and customer portal it may already have.
* Good, because the payments interface carries only money, so a second adapter, for another payment
  processor, is a small job.
* Bad, because overage is billed in arrears, so a customer that never pays can use up to the billing
  threshold before a charge fails and dunning begins.

### Confirmation

The boundary check fails the build if a lifecycle handler names Stripe. The adapter's tests run
against recorded Stripe responses and events, with no account (`NFR-04`).

## Pros and Cons of the Options

### Stripe alone, with credits in CMOkit's ledger

* Good, because it meets every driver.
* Bad, because the running balance is CMOkit's to build (ADR-0006).

### Autumn, over Stripe Billing

* Good, because it keeps a running balance, limits per user, and is free at low volume.
* Bad, because it is a commercial service between an adopter and its Stripe account, its source is no
  longer public, and its free tier and prices are its to change.

### OpenMeter, as Kong Konnect Metering & Billing

* Good, because its source is Apache-2.0.
* Bad, because self-hosting it means Kafka and ClickHouse, which do not scale to zero, and its hosted
  service charges a share of billing.
* Bad, because it replaces Stripe Billing as the system of record for subscriptions and invoices.

### Flexprice

* Good, because its wallets keep a running balance with expiry and automatic top-up.
* Bad, because its hosted service starts at $199 a month, and self-hosting it means Kafka, ClickHouse
  and Temporal.
* Bad, because it replaces Stripe Billing.

### Lago

* Good, because it is the most established of the open-source tools.
* Bad, because its running balance and wallet alerts are on its paid plan, priced on request, and
  self-hosting it means always-on workers.
* Bad, because it replaces Stripe Billing.

## More Information

Sources: Stripe's [usage alerts and billing thresholds](https://docs.stripe.com/billing/subscriptions/usage-based/monitor);
Autumn's [pricing](https://useautumn.com/pricing); Flexprice's [pricing](https://flexprice.io/pricing)
and [self-hosting](https://docs.flexprice.io/developers/self-hosting.md); OpenMeter's
[pricing](https://openmeter.io/pricing) and [Kong's pricing](https://konghq.com/pricing); Lago's
[pricing](https://getlago.com/pricing) and [self-hosting](https://getlago.com/docs/guide/self-hosted/docker).

**Reversal cost.** Moderate: another payment processor is a second adapter, and moving each adopter's
customers and subscriptions to it. Nothing in the ledger, and nothing a product sends, would change.

## Revisit when

* An adopter's payment processor is not Stripe.
* Stripe adds a fee for the features this record uses.
