---
status: "proposed"
kind: "requirement-driven"
date: 2026-11-10
decision-makers: [Geoff]
---

# ADR-0040: A hosted customer's waitlist, referral links and messages are served from CMOkit's own domains

**Requirements served:** `HST-01`, `HST-10`, `HST-11`, `HST-16`.

## Context and Problem Statement

A self-hosted adopter deploys the engine per site, to its own Cloudflare account, from a repository
that depends on the published packages (ADR-0002, ADR-0003). ADR-0016 kept the engine out of the
hosted service.

Hosted CMOkit's customer is a content creator who is not a developer, with no Cloudflare account,
repository or terminal of their own (`HST-01`). Their waitlist, referral links and messages are
lifecycle work. A hosted customer who had to run that work, or point a domain of theirs at it, would
face the setup the hosted offering exists to remove, and would have no reason to pay for it. So hosted
CMOkit runs that work for them (`HST-16`).

Of CMOkit's features, only landing page experiments need a customer's own domain, because the edge
has to sit in front of the pages being tested. Landing page experiments are parked for hosted
customers.

## Decision Drivers

* No domain, DNS, Cloudflare account, repository or terminal for the customer (`HST-01`).
* One customer's waitlist, leads and messages are never reachable from another's (`HST-10`).
* What is hosted is what is open source (`HST-11`).

## Considered Options

* Served from CMOkit's own domains, by CMOkit's own deployment
* An edge in front of the customer's own domain, on CMOkit's account
* The customer's own Cloudflare account, as for a self-hosted adopter

## Decision Outcome

Chosen option: "Served from CMOkit's own domains, by CMOkit's own deployment", because it is the one
option that asks the customer to set up nothing.

> A hosted customer's waitlist, referral links and messages are served from CMOkit's own domains, by
> CMOkit's own deployment on its own Cloudflare account. A hosted customer sets up no domain and no
> DNS. A self-hosted adopter deploys the same packages to an account and domain of its own, as before.

### Consequences

* Good, because a hosted customer's whole setup stays the account, the subscription and the
  connections `HST-01` names.
* Good, because the engine's packages stay the same for hosted and self-hosted use (`HST-11`).
* Bad, because a hosted customer's waitlist and referral links carry CMOkit's domain, not theirs.

### Confirmation

Enforced by review: nothing in hosted CMOkit's setup asks a customer for a domain or a DNS change.

## Pros and Cons of the Options

### Served from CMOkit's own domains, by CMOkit's own deployment

* Good, because it meets every driver.
* Bad, because the customer's links show CMOkit's domain.

### An edge in front of the customer's own domain, on CMOkit's account

* Good, because the waitlist and referral links would carry the customer's own domain.
* Bad, because the customer would have to move their domain, or its DNS, to CMOkit, which `HST-01`
  rules out, and nothing but landing page experiments needs it.

### The customer's own Cloudflare account, as for a self-hosted adopter

* Good, because the customer would own every byte of their site's data.
* Bad, because it needs a Cloudflare account, a repository and a deploy of the customer's own, which
  `HST-01` rules out and which would leave no reason to pay for the hosted offering.

## More Information

**Follow-on obligations.** ADR-0016's account of what is hosted points here. When landing page
experiments return for hosted customers, they run on a landing page CMOkit hosts, and the most a
customer does is give that page a custom domain of theirs, as landing page platforms such as Unbounce
let their customers do. That is a decision of its own.

**Reversal cost.** Low: serving a customer's waitlist from a domain of theirs later adds a custom
domain and changes no one's data.

## Revisit when

* Landing page experiments return for hosted customers.
