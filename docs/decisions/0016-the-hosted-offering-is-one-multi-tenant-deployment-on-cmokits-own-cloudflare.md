---
status: "draft"
kind: "requirement-driven"
date: 2026-10-30
decision-makers: [Geoff]
---

# ADR-0016: The hosted offering is one multi-tenant deployment of the engine, on CMOkit's own Cloudflare account

**Requirements served:** `HST-01`, `HST-08`, `HST-09`, `HST-10`, `HST-11`, `NFR-06`, `CNT-21`.

## Context and Problem Statement

The engine is deployed by its adopter, per site, to the adopter's own Cloudflare account (ADR-0003).
Its reviewed configuration is bundled at deploy and everything else is a Worker variable or secret
the deploy sets (ADR-0008). A hosted customer has none of that: no Cloudflare account, no repository
and no terminal (`HST-01`). Many customers share whatever CMOkit runs for them, and nothing done for
one may read or change another's data (`HST-10`). Every part still scales to zero (`NFR-06`), and
anyone can run what the hosted offering runs on a Cloudflare account of their own (`HST-11`).

What the hosted offering runs is small, because the model work happens in the customer's own Claude
(`HST-08`, `HST-09`): CMOkit accounts and their sign-in, the remote MCP server the content plugin uses,
the customer's connections to its site and its event platform, and the records content needs. Content
needs no edge in front of the customer's site (`CNT-21`). Putting the edge in front of a hosted
customer's own domain would take Cloudflare for SaaS custom hostnames: 100 are included on the Free,
Pro and Business plans, then $0.10 each.

## Decision Drivers

* No Cloudflare account, repository or terminal for the customer (`HST-01`).
* One customer's data is never reachable from another's requests (`HST-10`).
* Scales to zero, so a quiet customer costs storage and nothing else (`NFR-06`).
* The hosted services call no model (`HST-09`).
* What is hosted is what is open source, deployed the same way (`HST-11`).
* One vendor and one runtime, as for the engine (ADR-0003).

## Considered Options

* One multi-tenant deployment on CMOkit's own Cloudflare account, each customer's state in Durable
  Objects of its own
* A deployment per customer in CMOkit's account, through Workers for Platforms
* A deployment per customer in the customer's own Cloudflare account, which CMOkit deploys for them
* No hosted offering: the self-hosted engine with a guided installer
* A hosted service that also writes the content, calling a model itself

## Decision Outcome

Chosen option: "One multi-tenant deployment on CMOkit's own Cloudflare account, each customer's state
in Durable Objects of its own", because it is the one option with nothing per customer to deploy, and
Durable Objects already give each customer storage no other customer's request can address.

> The hosted offering is one deployment of CMOkit's open-source packages to CMOkit's own Cloudflare
> account, serving every hosted customer. Each customer's state is kept in Durable Objects named by
> the customer's id (ADR-0030), and every request is authorized as a person acting for one customer,
> so every call names the customer it acts on. A self-hosted deployment runs the same Workers with
> customers of its own. The hosted services call no model. The edge in front of a customer's own
> domain is not part of the hosted offering.

### Consequences

* Good, because a new customer is a sign-in, not a deployment, and costs nothing until it stores
  something.
* Good, because the hosted and self-hosted code is one code base, so parity is a property of the
  build, not a promise kept by hand (`HST-11`).
* Good, because with no model in the hosted path, a customer's cost to CMOkit is storage, requests
  and bought tools, all of which scale to zero.
* Bad, because isolation rests on every handler naming the right customer, so a bug in that check
  leaks across customers; it needs tests of its own.
* Bad, because settings and credentials that a self-hosted engine reads from its bundled
  configuration and Worker secrets (ADR-0008) are, for a hosted customer, data the customer supplies
  at run time, held in that customer's object (ADR-0019, ADR-0030).
* Neutral, because hosted customers get content and its measurement, but not experiments on their
  own domain.

### Confirmation

Tests drive every tool and route as a person of one customer against another customer's ids and
assert refusal, with no account at any bought tool (`NFR-04`). That no hosted handler calls a model
is checked in review.

## Pros and Cons of the Options

### One multi-tenant deployment on CMOkit's own Cloudflare account, each customer's state in Durable Objects of its own

* Good, because it meets every driver.
* Bad, because every request path must carry and check the customer.

### A deployment per customer in CMOkit's account, through Workers for Platforms

* Good, because each customer's Workers are separate scripts, and each could carry its own bundled
  configuration, as the engine does today.
* Bad, because it costs $25 a month before the first customer, and every release becomes a deploy to
  every customer's script.
* Bad, because Durable Objects already separate each customer's state, so the separate scripts add
  little the hosted offering needs.

### A deployment per customer in the customer's own Cloudflare account, which CMOkit deploys for them

* Good, because the customer would own every byte, and CMOkit would hold no customer data.
* Bad, because every customer needs a Cloudflare account, which `HST-01` rules out.

### No hosted offering: the self-hosted engine with a guided installer

* Good, because there is nothing to operate.
* Bad, because the audience has no terminal and no repository, so an installer still asks them for
  the one thing they cannot do.

### A hosted service that also writes the content, calling a model itself

* Good, because a weekly batch could be ready without the customer opening Claude.
* Bad, because inference would become the largest and least predictable cost of every customer, which
  `HST-09` rules out, and the customer already pays for a Claude that does this work.

## More Information

Sources: Cloudflare's [Workers for Platforms pricing](https://developers.cloudflare.com/cloudflare-for-platforms/workers-for-platforms/reference/pricing/)
and [Cloudflare for SaaS plans](https://developers.cloudflare.com/cloudflare-for-platforms/cloudflare-for-saas/plans/),
read through search extracts of those pages on 2026-10-30.

**Follow-on obligations.** A rule that every hosted handler checks the customer before it acts, and
its tests. The CLAUDE.md rule that secrets come from the deploying environment alone covers CMOkit's
own secrets; credentials a customer supplies at run time need a rule of their own once ADR-0019 is
accepted.

**Reversal cost.** Moderate: moving to a deployment per customer keeps the handlers and moves each
customer's objects.

## Revisit when

* A customer's auditor or contract requires its own deployment.
* A hosted customer asks for experiments on its own domain, which needs the edge behind custom
  hostnames.
* A limit of one deployment, such as requests or objects per account, comes within sight.
