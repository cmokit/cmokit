---
status: "proposed"
kind: "requirement-driven"
date: 2026-11-10
decision-makers: [Geoff]
---

# ADR-0040: A hosted customer's landing page and waitlist are served by CMOkit, at a custom domain the customer points at it

**Requirements served:** `HST-01`, `HST-10`, `HST-11`, `HST-16`, `HST-18`.

## Context and Problem Statement

A self-hosted adopter deploys the engine per site, to its own Cloudflare account, from a repository
that depends on the published packages (ADR-0002, ADR-0003). ADR-0016 kept the engine out of the
hosted service.

Hosted CMOkit's customer is a content creator who is not a developer, with no Cloudflare account,
repository or terminal of their own (`HST-01`). Their landing page, waitlist, referral links and
messages are engine work. A hosted customer who had to run that work, or move a domain to CMOkit,
would face the setup the hosted offering exists to remove, and would have no reason to pay for it. So
hosted CMOkit runs that work for them (`HST-16`).

A customer's landing page still needs the customer's own domain. cmokit.ai, CMOkit's own, is the
first, and its zone is already on CMOkit's Cloudflare account. Every customer after it brings a
domain CMOkit does not hold (`HST-18`).

## Decision Drivers

* No domain move, DNS migration, Cloudflare account, repository or terminal for the customer
  (`HST-01`).
* The customer's landing page is at the customer's own domain (`HST-18`).
* One customer's waitlist, leads and messages are never reachable from another's (`HST-10`).
* What is hosted is what is open source (`HST-11`).

## Considered Options

* Served by CMOkit's own deployment, at a custom domain the customer points at it with a record at
  their own DNS provider
* Served by CMOkit at an address on CMOkit's own domain only
* The customer's domain moved to CMOkit's Cloudflare account, with an edge in front of it
* The customer's own Cloudflare account, as for a self-hosted adopter

## Decision Outcome

Chosen option: "Served by CMOkit's own deployment, at a custom domain the customer points at it with
a record at their own DNS provider", because it gives the customer their own domain while their
domain and its DNS stay where they are, as landing page platforms such as Unbounce do.

> A hosted customer's landing page, waitlist, referral links and messages are served by CMOkit's own
> deployment on its own Cloudflare account. The customer gives their landing page a custom domain by
> adding a record at their own DNS provider, and moves no domain or DNS to CMOkit. A self-hosted
> adopter deploys the same packages to an account and domain of its own, as before.

### Consequences

* Good, because the customer's whole setup stays the account, the subscription and the connections
  `HST-01` names, plus one DNS record for their domain.
* Good, because the engine's packages stay the same for hosted and self-hosted use (`HST-11`).
* Bad, because CMOkit has to serve and certify domains it does not hold, which cmokit.ai, already on
  CMOkit's account, does not exercise. That is built before the second customer.

### Confirmation

Enforced by review: nothing in hosted CMOkit's setup asks a customer to move a domain or change more
than the one record for their custom domain.

## Pros and Cons of the Options

### Served by CMOkit's own deployment, at a custom domain the customer points at it with a record at their own DNS provider

* Good, because it meets every driver.
* Bad, because serving a domain CMOkit does not hold is work cmokit.ai does not need.

### Served by CMOkit at an address on CMOkit's own domain only

* Good, because it needs no custom domain work at all.
* Bad, because the customer's landing page would not be at their own domain, which `HST-18` requires.

### The customer's domain moved to CMOkit's Cloudflare account, with an edge in front of it

* Good, because a Worker route on the customer's zone is how a self-hosted adopter runs today.
* Bad, because the customer would move their domain or its DNS to CMOkit, which `HST-01` rules out.

### The customer's own Cloudflare account, as for a self-hosted adopter

* Good, because the customer would own every byte of their site's data.
* Bad, because it needs a Cloudflare account, a repository and a deploy of the customer's own, which
  `HST-01` rules out and which would leave no reason to pay for the hosted offering.

## More Information

**Follow-on obligations.** How CMOkit serves and certifies a customer's custom domain is a decision
of its own, made before the second customer. ADR-0016's account of what is hosted points here.

**Reversal cost.** Low: a customer's custom domain is one record they can point elsewhere.

**Related.** A customer's waitlist is kept by the content server and joined from a page on any host,
including one the customer hosts themselves (ADR-0043).

## Revisit when

* A customer cannot add a record at their DNS provider.
