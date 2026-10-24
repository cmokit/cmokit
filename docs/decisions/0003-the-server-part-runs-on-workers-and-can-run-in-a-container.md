---
status: "proposed"
kind: "requirement-driven"
date: 2026-10-11
decision-makers: [Geoff]
---

# ADR-0003: The server part runs as Cloudflare Workers, and lifecycle work can run as a container inside an audited product's boundary

**Requirements served:** `SRV-03`, `MSR-03`, `LEAD-02`, `SUB-06`, `CRD-01`, `PRD-03`, `NFR-02`, `NFR-05`, `NFR-06`.

## Context and Problem Statement

CMOkit has one server part. It has two kinds of work:

* **Edge work, in front of the site:** resolving a visitor's variant before the page is sent
  (`SRV-03`), and recording the conversion server-side (`MSR-03`). It must sit in the request path
  between the visitor and the site.
* **Lifecycle work, off the request path:** capturing leads with a secret that can write to the
  messaging tool (`LEAD-02`), receiving the payment processor's signed webhook events (`SUB-06`) and
  the product's usage events (`CRD-01`), keeping each customer's credit ledger, and calling the
  product with a client credential that can revoke its customers' access (`PRD-03`).

Edge work keeps no state: a visitor's variant is a cookie in their own browser, the variants are
pages of the site, and the server-side conversion is passed on to analytics. Lifecycle work's one
store is the credit ledger, a Durable Object per customer on Cloudflare (ADR-0006); subscriptions and
invoices are the payment processor's (ADR-0012).

CMOkit's adopters are small businesses. Their traffic and their events are few and uneven, so every
part must scale to zero (`NFR-06`). The edge already puts Cloudflare in every visitor's request path,
and in front of the site's domain.

Some adopters' products are audited, under SOC 2 for instance. For them, wherever the credential that
can revoke customers' access runs is in the audit's scope. Most auditors treat a cloud vendor as a
subservice organization, relying on the vendor's own SOC 2 report and testing only the adopter's
controls over it: who can reach the account, how secrets are scoped and rotated, how code is deployed
and what is logged. Cloudflare publishes SOC 2 Type II and ISO 27001 reports and is already the
adopter's vendor for the edge. A few adopters cannot use it for lifecycle work at all: those handling
regulated data, such as health records under HIPAA, or bound by contracts that fix their vendors or
the region their data stays in (`NFR-02`).

## Decision Drivers

* Every part scales to zero (`NFR-06`).
* Variant resolution is in the request path, with no flash of the default (`SRV-03`), and is fast
  for a visitor's first page wherever they are.
* An audited product can keep every lifecycle credential inside its own boundary (`NFR-02`).
* One code base, not two implementations of the same logic.
* Each way of running the work is tested the way it is deployed.
* Secrets come from the deploying environment (`NFR-05`).

## Considered Options

* Edge and lifecycle work as Cloudflare Workers, with lifecycle work also runnable as a container
  inside an audited product's boundary, all written to web-standard handlers
* Edge work as a Worker, lifecycle work only as a container inside the product's boundary
* Everything as Cloudflare Workers, with no other way to run lifecycle work
* Everything in the product's own cloud, with edge work behind its load balancer and CDN
* Edge work and lifecycle work written apart

## Decision Outcome

Chosen option: "Edge and lifecycle work as Cloudflare Workers, with lifecycle work also runnable as a
container inside an audited product's boundary, all written to web-standard handlers", because it
scales to zero on the one vendor already in the request path, and still lets an audited product keep
its credentials at home.

> The server part is written against the web-standard `Request` and `Response`, with no runtime's
> own APIs in its handlers. Edge work runs only as a Cloudflare Worker and keeps no state. Lifecycle
> work runs as a Cloudflare Worker by default. A deployment that must keep its credentials inside the
> product's audit boundary runs lifecycle work instead as a container, on a container platform of the
> product's own cloud that scales to zero, such as Cloud Run, AWS Lambda or Azure Container Apps.
> There, lifecycle's public endpoints — the payment processor's webhook events, and lead capture, which
> the edge proxies from the site's own domain — are reached through the boundary's own front door, and
> the product reaches the usage endpoint from inside the boundary only. The credit ledger stays on
> Cloudflare either way, and a container reaches it through a Worker with a secret the deployment
> supplies.

### Consequences

* Good, because nothing runs, and nothing is billed, while nobody visits and no event arrives.
* Good, because a visitor's first page is resolved in a city near them, with no cold start.
* Good, because an adopter who is not audited deploys one vendor's Workers and nothing else.
* Good, because an audited adopter who can carve Cloudflare out keeps the same deployment, and one who
  cannot keeps every lifecycle credential in their own cloud.
* Bad, because lifecycle work has two supported runtimes, so its tests run on both adapters.
* Bad, because an adopter running lifecycle work on Cloudflare adds Cloudflare to its controls over
  that credential, and, holding leads' contact details there, lists Cloudflare among its
  subprocessors.
* Bad, because even a container deployment keeps customers' balances and usage on Cloudflare, so an
  adopter that cannot hold them there cannot use CMOkit's credits.
* Bad, because a container that has scaled to zero starts cold for the first event after a quiet
  spell. Lifecycle work is off the visitor's request path and its senders retry, so a cold start
  delays an event rather than losing it.

### Confirmation

Edge handler tests run on the Worker adapter, and lifecycle handler tests on the Worker adapter and
the container adapter, in CI, with no account at any bought tool (`NFR-04`). A check fails the build
if `@cmokit/edge` depends, directly or through another package, on `@cmokit/lifecycle`.

## Pros and Cons of the Options

### Edge and lifecycle work as Cloudflare Workers, with lifecycle work also runnable as a container inside an audited product's boundary, all written to web-standard handlers

* Good, because it meets every driver.
* Bad, because lifecycle work is supported on two runtimes.

### Edge work as a Worker, lifecycle work only as a container inside the product's boundary

* Good, because no lifecycle credential ever runs outside the product's boundary.
* Bad, because every adopter, audited or not, runs a container in a cloud of their own, which most
  small businesses do not have.
* Bad, because the cost it avoids — adding Cloudflare to the controls over one credential — is small
  for most audited adopters, whose auditors carve Cloudflare out.

### Everything as Cloudflare Workers, with no other way to run lifecycle work

* Good, because there is one runtime to support and test.
* Bad, because an adopter whose regulation or contracts keep its credentials in its own cloud cannot
  use CMOkit at all (`NFR-02`).

### Everything in the product's own cloud, with edge work behind its load balancer and CDN

* Good, because one cloud and one vendor sit in every request path, inside one audit scope.
* Bad, because a first visit makes a round trip to one region and, for a container that scales to
  zero, waits for a cold start, where a Worker answers from a city near the visitor.
* Bad, because a cloud's own programmable load-balancer extensions, such as Google Cloud's Service
  Extensions plugins, are WebAssembly written in Rust, Go or C++, so using them would write variant
  resolution a second time.
* Bad, because traffic splitting built into a load balancer is assigned per request by the load
  balancer, not once per visitor by the experiments tool (`EXP-01`, `EXP-02`).

### Edge work and lifecycle work written apart

* Good, because each part uses its runtime fully.
* Bad, because shared logic — identity, event verification, configuration — is written twice and
  drifts.

## More Information

**Reversal cost.** Low: the handlers are web-standard, so dropping either runtime for lifecycle work
removes an adapter and its tests, and nothing a deployment configures.

## Revisit when

* Adopters who need the container are so few that its adapter costs more than it serves.
* An adopter's auditor puts the edge's request path itself in scope, so a vendor there costs more
  than a slower first visit.
