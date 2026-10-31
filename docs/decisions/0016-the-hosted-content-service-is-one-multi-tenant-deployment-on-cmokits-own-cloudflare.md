---
status: "draft"
kind: "requirement-driven"
date: 2026-10-30
decision-makers: [Geoff]
---

# ADR-0016: The hosted content service is one multi-tenant deployment, on CMOkit's own Cloudflare account

**Requirements served:** `HST-01`, `HST-08`, `HST-09`, `HST-10`, `HST-11`, `NFR-06`, `CNT-21`.

## Context and Problem Statement

The engine is deployed by its adopter, per site, to the adopter's own Cloudflare account (ADR-0003),
and it stays that way. What is offered hosted is content production: a customer sets it up with a
CMOkit account, a subscription and, if it sells through one, its event platform, with no Cloudflare
account, repository or terminal of its own (`HST-01`). Content needs none of the engine (`CNT-21`).
Many customers share whatever CMOkit runs for them, and nothing done for one may read or change
another's data (`HST-10`). Every part scales to zero (`NFR-06`), and anyone can run what the hosted
service runs on a Cloudflare account of their own (`HST-11`).

What the hosted service runs is small, because the model work happens in the customer's own Claude
(`HST-08`, `HST-09`): the issuer that signs people in (ADR-0018), the content server the content
plugin uses (ADR-0029), and the records content needs (ADR-0030).

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
* CFOKit's production infrastructure, shared at first: Python on Cloud Run, Keycloak and Cloud SQL
* A hosted service that also writes the content, calling a model itself

## Decision Outcome

Chosen option: "One multi-tenant deployment on CMOkit's own Cloudflare account, each customer's state
in Durable Objects of its own", because it is the one option with nothing per customer to deploy, and
Durable Objects already give each customer storage no other customer's request can address.

> The hosted content service is one deployment of CMOkit's open-source issuer and content server to
> CMOkit's own Cloudflare account, serving every hosted customer. Each customer's state is kept in
> Durable Objects named by the customer's id (ADR-0030), and every request is authorized as a person
> acting for one customer, so every call names the customer it acts on. A self-hosted deployment runs
> the same Workers with customers of its own. The hosted services call no model. The engine, its edge
> and its experiments are not part of the hosted service.

### Consequences

* Good, because a new customer is a sign-in, not a deployment, and costs nothing until it stores
  something.
* Good, because the hosted and self-hosted code is one code base, so parity is a property of the
  build, not a promise kept by hand (`HST-11`).
* Good, because with no model in the hosted path, a customer's cost to CMOkit is storage, requests
  and bought tools, all of which scale to zero.
* Bad, because isolation rests on every handler naming the right customer, so a bug in that check
  leaks across customers; it needs tests of its own.
* Bad, because the content server's settings and credentials for a customer are data the customer
  supplies at run time, held in that customer's object (ADR-0019, ADR-0030), unlike the engine's,
  which are bundled at deploy (ADR-0008).

### Confirmation

Tests drive every tool and route as a person of one customer against another customer's ids and
assert refusal, with no account at any bought tool (`NFR-04`). That no hosted handler calls a model
is checked in review.

## Pros and Cons of the Options

### One multi-tenant deployment on CMOkit's own Cloudflare account, each customer's state in Durable Objects of its own

* Good, because it meets every driver.
* Bad, because every request path must carry and check the customer.

### A deployment per customer in CMOkit's account, through Workers for Platforms

* Good, because each customer's Workers are separate scripts.
* Bad, because it costs $25 a month before the first customer, and every release becomes a deploy to
  every customer's script.
* Bad, because Durable Objects already separate each customer's state, so the separate scripts add
  little.

### A deployment per customer in the customer's own Cloudflare account, which CMOkit deploys for them

* Good, because the customer would own every byte, and CMOkit would hold no customer data.
* Bad, because every customer needs a Cloudflare account, which `HST-01` rules out.

### CFOKit's production infrastructure, shared at first: Python on Cloud Run, Keycloak and Cloud SQL

* Good, because CFOKit's patterns and code would be reused as they stand, Keycloak brings passwords,
  second factors and passkeys, and CFOKit already pays for Keycloak and the database server, so the
  first months cost almost nothing more.
* Bad, because the two are separate products: CMOkit would share CFOKit's issuer, database server and
  project, and come inside the scope of CFOKit's assurance.
* Bad, because once split, CMOkit pays for an issuer and a database server that never scale to zero,
  and every customer reconnects Claude if the sign-in address changes.
* Bad, because it is a second language and a second vendor for CMOkit (ADR-0007, ADR-0003). CFOKit's
  patterns, such as published contracts and idempotency keys, carry over as designs instead.

### A hosted service that also writes the content, calling a model itself

* Good, because a weekly batch could be ready without the customer opening Claude.
* Bad, because inference would become the largest and least predictable cost of every customer, which
  `HST-09` rules out, and the customer already pays for a Claude that does this work.

## More Information

Sources: Cloudflare's [Workers for Platforms pricing](https://developers.cloudflare.com/cloudflare-for-platforms/workers-for-platforms/reference/pricing/),
read through a search extract of that page on 2026-10-30; CFOKit's records on its
[identity provider](https://github.com/cfokit/cfokit/blob/main/docs/decisions/0019-identity-provider-conformance-contract.md)
and [production deployment](https://github.com/cfokit/cfokit/blob/main/docs/decisions/0060-production-is-one-gcp-project-deployed-on-merge.md).

**Follow-on obligations.** A rule that every hosted handler checks the customer before it acts, and
its tests. The CLAUDE.md rule that secrets come from the deploying environment alone covers CMOkit's
own secrets; credentials a customer supplies at run time need a rule of their own once ADR-0019 is
accepted.

**Reversal cost.** Moderate: moving to a deployment per customer keeps the handlers and moves each
customer's objects.

## Revisit when

* A customer's auditor or contract requires its own deployment.
* A limit of one deployment, such as requests or objects per account, comes within sight.
