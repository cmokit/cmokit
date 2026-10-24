---
status: "proposed"
kind: "requirement-driven"
date: 2026-10-24
decision-makers: [Geoff]
---

# ADR-0012: Billing runs on Autumn over Stripe, behind an interface named for the job

**Requirements served:** `SUB-01`, `SUB-03`, `SUB-05`, `SUB-06`, `CUS-01`, `CRD-02`, `CRD-03`, `CRD-05`, `CRD-08`, `NFR-03`, `NFR-06`.

## Context and Problem Statement

Credit balances are kept by a billing tool behind CMOkit's billing interface (ADR-0006). The tool
must keep a running balance, report it low and exhausted, limit usage per user within a customer's
shared balance, and cost a small business nothing, or nearly, while its revenue is small (`NFR-06`).
The payment processor stays the system of record for charges; a tool that keeps Stripe Billing as
the system of record for subscriptions and invoices changes least for an adopter already on Stripe.

The candidates, as their own documentation stood on 2026-10-24:

| | Autumn | Flexprice | OpenMeter | Lago |
|---|---|---|---|---|
| Hosted, low volume | Free up to $8K monthly billing volume; Pro $375 a month | $199 a month and 0.5% of billing | Now Kong Konnect Metering & Billing: $20 per million events and 0.4% of billing | Price on request |
| Self-hosted, always on | Not offered: its source repository is no longer public | Postgres, Kafka, ClickHouse, Redis, Temporal | Kafka, ClickHouse, Postgres | Postgres, Redis, workers |
| Running balance and its events | A balance check; `balances.limit_reached`, `balances.usage_alert_triggered` | Real-time wallet balance; `wallet.credit_balance.dropped` | Entitlement balance; `entitlements.balance.threshold` | Ongoing balance and `wallet.depleted_ongoing_balance`, on its paid plan |
| Usage limit per user in a shared balance | Yes: entities with their own limits under the customer's balance | No per-user limit found | Not found | Not found |
| Stripe Billing | Kept as the system of record | Replaced; Stripe for payments | Replaced; invoices synced to Stripe | Replaced; Stripe for payments |

## Decision Drivers

* A running balance with events when it is low or exhausted (`CRD-03`, `CRD-05`).
* Usage limits per user within a shared balance (`CRD-08`).
* Nothing, or nearly, to pay while a business is small (`NFR-06`).
* Stripe stays the system of record for subscriptions, invoices and charges, with its hosted checkout
  and customer portal (`SUB-01`, `SUB-03`).
* Swappable behind an interface named for the job (`NFR-03`).

## Considered Options

* Autumn, over Stripe Billing
* OpenMeter, as Kong Konnect Metering & Billing
* Flexprice
* Lago

## Decision Outcome

Chosen option: "Autumn, over Stripe Billing", because it is the only candidate that meets every
driver, and the only one that leaves Stripe Billing as the system of record.

> The billing interface is implemented by one adapter, for Autumn, which runs over the adopter's
> Stripe account. Plans, their entitlements, credit grants and top-ups are configured in Autumn from
> CMOkit's configuration (`SUB-05`, `CRD-02`); checkout, invoices, charges and the customer portal are
> Stripe's. A customer in CMOkit is one customer in Autumn and in Stripe, and a user with a usage limit
> is an entity of that customer. The lifecycle verifies Autumn's and Stripe's webhook events before
> acting on them (`SUB-06`). No handler names Autumn or Stripe; only the adapter does.

### Consequences

* Good, because a small business pays nothing beyond Stripe's own fees until its billing passes the
  free tier.
* Good, because an adopter keeps the Stripe account, prices and customer portal it may already have.
* Bad, because Autumn's source is no longer public, so it can be bought but not run by an adopter, and
  its free tier and prices are Autumn's to change.
* Bad, because Autumn is a young company, so the interface must stay narrow enough that a second
  adapter is a small job.
* Bad, because Autumn's balance check lets usage through when a provider behind it is degraded, so a
  product that can afford no overage enforces a limit of its own.

### Confirmation

The boundary check fails the build if a lifecycle handler names Autumn or Stripe. The adapter's tests
run against recorded Autumn and Stripe responses, with no account at either (`NFR-04`).

## Pros and Cons of the Options

### Autumn, over Stripe Billing

* Good, because it meets every driver.
* Bad, because it cannot be self-hosted, and its company is young.

### OpenMeter, as Kong Konnect Metering & Billing

* Good, because its price follows usage, so it costs little while a business is small, and its source
  is Apache-2.0.
* Good, because grants carry priority, expiry, rollover and recurrence.
* Bad, because it replaces Stripe Billing as the system of record for subscriptions and invoices.
* Bad, because no usage limit per user within a shared balance was found (`CRD-08`), and its hosted
  service is moving into an API platform built for enterprises.

### Flexprice

* Good, because its wallets keep a settled and an ongoing balance, with priority, expiry and automatic
  top-up.
* Bad, because its hosted service starts at $199 a month, and self-hosting it means running Kafka,
  ClickHouse and Temporal, so it does not scale to zero (`NFR-06`).
* Bad, because it replaces Stripe Billing, and no per-user limit was found.

### Lago

* Good, because it is the most established of the open-source tools.
* Bad, because its running balance and wallet alerts are on its paid plan, priced on request, and
  self-hosting it means always-on workers.
* Bad, because it replaces Stripe Billing, and no per-user limit was found.

## More Information

Sources: Autumn's [pricing](https://useautumn.com/pricing), [balance check](https://docs.useautumn.com/api-reference/core/check.md),
[webhooks](https://docs.useautumn.com/documentation/webhooks.md) and
[entities](https://docs.useautumn.com/documentation/customers/feature-entities.md); Flexprice's
[pricing](https://flexprice.io/pricing) and [self-hosting](https://docs.flexprice.io/developers/self-hosting.md);
OpenMeter's [pricing](https://openmeter.io/pricing), [Kong's pricing](https://konghq.com/pricing) and
[notifications](https://openmeter.io/blog/usage-and-balance-notifications); Lago's
[pricing](https://getlago.com/pricing), [wallets](https://getlago.com/docs/guide/wallet-and-prepaid-credits/overview)
and [self-hosting](https://getlago.com/docs/guide/self-hosted/docker).

**Reversal cost.** Moderate: a second adapter, and moving each adopter's plans and balances to the new
tool. Nothing a product sends would change.

## Revisit when

* Autumn's free tier or prices change so that a small business pays for it before it earns.
* Stripe keeps a running credit balance with events, so the billing tool can be dropped (ADR-0006).
* An adopter must run its billing tool itself.
