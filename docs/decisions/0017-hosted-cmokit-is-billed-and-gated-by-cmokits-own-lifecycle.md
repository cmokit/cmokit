---
status: "draft"
kind: "requirement-driven"
date: 2026-10-30
decision-makers: [Geoff]
---

# ADR-0017: Hosted CMOkit is billed and gated by CMOkit's own lifecycle, and meters nothing yet

**Requirements served:** `HST-12`, `HST-13`, `HST-14`, `SUB-01`, `SUB-03`, `SUB-04`, `SUB-05`, `CUS-01`, `CUS-03`, `CRD-02`.

## Context and Problem Statement

Hosted CMOkit is a subscription product: a customer subscribes, and manages and cancels its
subscription without contacting anyone (`HST-12`). CMOkit already describes the machine every
subscription product needs: a free trial started in the payment processor's hosted checkout
(`SUB-01`), a customer portal (`SUB-03`), access revoked when a subscription becomes unpaid or ends
and restored when it is reactivated (`SUB-04`), plans and trial length as configuration (`SUB-05`),
a customer created at its first checkout (`CUS-01`, `CUS-03`), and credits for metered usage
(`CRD-02`). Money runs on Stripe (ADR-0012), access is changed by configured calls to the product's
API (ADR-0004), and credits are CMOkit's own ledger (ADR-0005, ADR-0006). CMOkit is its own first
customer (`HST-14`).

The hosted services run no inference, so what one customer costs CMOkit is storage, requests and
bought tools: small, and close to the same for every customer of one size. What is gated is only
what CMOkit hosts. The content skill is open source and runs in the customer's own Claude, so it
cannot be gated, which the out-of-scope row on software with no hosted part already says.

## Decision Drivers

* CMOkit sells itself with the machine it sells, so its own billing finds its own bugs first
  (`HST-14`).
* No billing code of the hosted offering's own beside the lifecycle.
* A customer whose access ends can still sign in, pay and take its data with it (`HST-13`).
* Meter nothing until a cost varies enough by customer to need it.

## Considered Options

* CMOkit's own lifecycle, with hosted CMOkit as a product in its configuration, and no credits until
  a cost calls for them
* The same, with usage credits from the start
* Stripe Checkout and Billing wired into the hosted services directly, beside the lifecycle
* A merchant of record that sells the subscription and handles sales tax

## Decision Outcome

Chosen option: "CMOkit's own lifecycle, with hosted CMOkit as a product in its configuration, and no
credits until a cost calls for them", because the lifecycle already does every step, and running
CMOkit's own billing through it is the most direct test of it there is.

> Hosted CMOkit is a product in a CMOkit lifecycle configuration of CMOkit's own. Its plans and trial
> are configuration (`SUB-05`). The signed-in person starts a trial in Stripe's hosted checkout, which
> creates the customer with that person as its first user (`CUS-03`), and manages it in Stripe's
> customer portal (`SUB-03`). The lifecycle gives and revokes the customer's access by configured
> calls to the hosted services' own API (ADR-0004) as its subscription changes (`SUB-04`). Revoked
> access stops the hosted tools that read and write the customer's records and publish to its site;
> the person can still sign in, pay and export (`HST-13`). Plans grant no credits, and nothing is
> metered.

### Consequences

* Good, because the subscription lifecycle is exercised by a paying product before any adopter
  depends on it.
* Good, because the hosted offering has no billing code of its own.
* Bad, because the hosted offering cannot charge before the lifecycle's subscription handling exists.
* Neutral, because adding credits later is configuration (`CRD-02`), not a change to the hosted
  services.

### Confirmation

The lifecycle's own tests cover the subscription events. A test of the hosted services asserts that a
revoked customer's write tools refuse, and that its sign-in, checkout and export still work.

## Pros and Cons of the Options

### CMOkit's own lifecycle, with hosted CMOkit as a product in its configuration, and no credits until a cost calls for them

* Good, because it meets every driver.
* Bad, because it ties the hosted offering's launch to the lifecycle's subscription work.

### The same, with usage credits from the start

* Good, because a heavy customer would pay for what it uses, and the credit ledger would be exercised
  too.
* Bad, because without inference no hosted cost varies enough by customer to be worth a balance a
  solo creator has to watch, so it is premature.

### Stripe Checkout and Billing wired into the hosted services directly, beside the lifecycle

* Good, because it could ship before the lifecycle's subscription handling exists.
* Bad, because it is a second implementation of the lifecycle, inside CMOkit, kept in step by hand.

### A merchant of record that sells the subscription and handles sales tax

* Good, because it takes on sales tax and VAT across countries.
* Bad, because CMOkit would bill itself on a different processor from the one it supports
  (ADR-0012), and would learn nothing about its own lifecycle by doing so.

## More Information

**Follow-on obligations.** The hosted services publish the API the lifecycle calls to give and revoke
a customer's access. Whether sales tax is collected through the payment processor's own tax features
is a question for the payments adapter, not this record.

**Reversal cost.** Low: moving the hosted offering's billing elsewhere replaces the configured calls,
and nothing in the hosted services depends on how access was decided.

## Revisit when

* One customer's monthly cost of bought tools and storage exceeds a tenth of its plan's price, so
  usage needs credits.
* A hosted feature arrives whose cost scales with use, such as sending email on a customer's behalf.
* Sales tax obligations outgrow what the payment processor collects.
