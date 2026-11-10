---
status: "proposed"
kind: "requirement-driven"
date: 2026-11-10
decision-makers: [Geoff]
---

# ADR-0042: Hosted CMOkit is priced per brand, and CMOkit's own account page activates its waitlist

**Requirements served:** `CUS-01`, `CUS-02`, `CUS-03`, `HST-01`, `HST-12`, `HST-14`, `HST-17`, `SUB-05`.

## Context and Problem Statement

A person activated in hosted CMOkit's closed beta becomes CMOkit's customer. They then create their
own content and landing page experiments and run their own activation funnel (`CUS-03`). Most
creators have one brand. Some, like Geoff, run several, as CMOkit and CFOKit, each with its own
brand context, connections, content and, once the beta ends, subscription. Until now an activated
person got exactly one customer, with no way to add another.

Activation is the other half. Hosted CMOkit's operator activates people on CMOkit's own waitlist,
one by one, and never on a tenant's waitlist. That took the lifecycle's waitlist key and the CLI, a
password and a terminal that the hosted target user, a non-technical creator, never has (`HST-01`).

## Decision Drivers

* Most creators have one brand; the price must be simple for them (`HST-12`).
* A brand is what a person runs a campaign for, so it is what holds the brand context, connections
  and subscription (`CUS-01`).
* CMOkit's operator activates from CMOkit's own portal, with no key to hold (`HST-14`, `HST-17`).
* No cap or charge while the beta is unpaid, and nothing built that the beta does not need.

## Considered Options

* Priced per brand: each brand a customer with its own subscription, added by any of its users
* Priced per account: one subscription for a person, covering every brand they run
* Priced per account with a cap on brands, raised by a higher plan

## Decision Outcome

Chosen option: "Priced per brand", because a brand is already a customer in CMOkit's records, with
its own billing, so pricing by brand needs no new billing model, and a one-brand creator pays once.

> Hosted CMOkit is priced per brand. Each brand is a customer (`CUS-01`) with its own brand context,
> connections, content and subscription, billed to the person who added it. An activated person's
> first brand is made at their first call (`CUS-03`); any user of a brand adds another on the
> account page, and is its first user. While the closed beta is unpaid, a person may add any number
> of brands and none is billed. Marketing's starting guess for the price is $29 a month per brand,
> to be set as configuration when paid plans start (`SUB-05`).
>
> The brand that the content server's `WAITLIST_CUSTOMER` names, CMOkit's own, activates people
> into CMOkit from its waitlist on its account page. Where that waitlist is kept is ADR-0043.

### Consequences

* Good, because a one-brand creator sees one price, and adding a brand needs no new billing code.
* Good, because CMOkit's operator activates people in the browser, with no key or terminal.
* Bad, because one Claude connection serves one brand at a time; switching brands means signing in
  again and choosing one, until a connection per brand is worth building.
* Neutral, because each brand's own waitlist, and where it is kept, is ADR-0043.

### Confirmation

The account page tests show that any user of a brand adds another from the page's own form, and
that the page lists every brand of the person, with a way to switch to another. The
waitlist's tests are ADR-0043's.

## Pros and Cons of the Options

### Priced per brand: each brand a customer with its own subscription, added by any of its users

* Good, because each customer already holds its own subscription (`CUS-02`), so nothing in billing
  changes, and the issuer already lets a person choose among their customers when signing in.
* Bad, because a person with several brands pays several subscriptions, which the price per brand
  has to allow for.

### Priced per account: one subscription for a person, covering every brand they run

* Good, because a person with many brands pays once.
* Bad, because a subscription would belong to a person rather than a customer, against `CUS-01` and
  `CUS-02`, and the price would not grow with the work CMOkit does.

### Priced per account with a cap on brands, raised by a higher plan

* Good, because the price grows with brands in steps.
* Bad, because it adds plans and a cap to enforce before any creator has paid, for the few with more
  than one brand.

## More Information

Geoff decided pricing per brand, with no brand cap during the beta and "Any customer" able to add
brands, on 2026-11-10.

**Reversal cost.** Low while the beta is unpaid: brands are customers either way, and only the price
would change.

## Revisit when

* Paid plans start, and the price per brand is set.
* Creators ask to use more than one brand in Claude at once.
* The second tenant needs its own waitlist activated.
