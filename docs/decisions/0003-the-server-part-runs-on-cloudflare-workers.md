---
status: "proposed"
kind: "requirement-driven"
date: 2026-10-24
decision-makers: [Geoff]
---

# ADR-0003: The server part runs on Cloudflare Workers alone

**Requirements served:** `SRV-03`, `MSR-03`, `LEAD-02`, `SUB-06`, `CRD-01`, `PRD-03`, `NFR-04`, `NFR-05`, `NFR-06`.

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
store is the credit ledger, a Durable Object per customer (ADR-0006); subscriptions and invoices are
the payment processor's (ADR-0012).

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
the region their data stays in.

## Decision Drivers

* Every part scales to zero (`NFR-06`).
* Variant resolution is in the request path, with no flash of the default (`SRV-03`), and is fast
  for a visitor's first page wherever they are.
* One vendor, one runtime and one deployment for everything CMOkit runs.
* Tests run with Node's test runner and no account at any bought tool (`NFR-04`).
* Secrets come from the deploying environment (`NFR-05`).

## Considered Options

* Edge and lifecycle work as Cloudflare Workers, with handlers written to the web-standard `Request`
  and `Response`
* The same, with lifecycle work also runnable as a container inside an audited product's own cloud
* Edge work as a Worker, lifecycle work only as a container inside the product's own cloud
* Everything in the product's own cloud, with edge work behind its load balancer and CDN

## Decision Outcome

Chosen option: "Edge and lifecycle work as Cloudflare Workers, with handlers written to the
web-standard `Request` and `Response`", because it scales to zero on the one vendor already in the
request path, with one runtime to build, test and deploy.

> Edge work and lifecycle work are Cloudflare Workers, deployed apart, and the credit ledger is their
> Durable Objects. Edge work keeps no state. Handlers are written against the web-standard `Request`
> and `Response`, with Cloudflare's own APIs — bindings, Durable Objects, alarms — in the adapters
> that wire them, so the handlers are tested with Node's test runner and the adapters under Wrangler.
> CMOkit runs nowhere else.

### Consequences

* Good, because nothing runs, and nothing is billed, while nobody visits and no event arrives.
* Good, because a visitor's first page is resolved in a city near them, with no cold start.
* Good, because an adopter deploys one vendor's Workers and nothing else, and CMOkit supports and
  tests one runtime.
* Good, because an audited adopter whose auditor carves Cloudflare out adds only its controls over
  the Cloudflare account and its secrets.
* Bad, because an audited adopter lists Cloudflare among its subprocessors, since leads' contact
  details and customers' usage are held there.
* Bad, because an adopter that cannot use Cloudflare for lifecycle work — regulated data, or contracts
  that fix its vendors or its data's region — cannot use CMOkit's lifecycle.

### Confirmation

Handler tests run with Node's test runner, and adapter tests under Wrangler, in CI, with no account at
any bought tool (`NFR-04`). A check fails the build if `@cmokit/edge` depends, directly or through
another package, on `@cmokit/lifecycle`.

## Pros and Cons of the Options

### Edge and lifecycle work as Cloudflare Workers, with handlers written to the web-standard `Request` and `Response`

* Good, because it meets every driver.
* Bad, because adopters who cannot use Cloudflare for lifecycle work are left out.

### The same, with lifecycle work also runnable as a container inside an audited product's own cloud

* Good, because an audited adopter could keep the credential to its product in its own cloud.
* Bad, because the credit ledger stays on Cloudflare either way, so customers' balances and usage
  would still be held there, and the adopters it serves remain few.
* Bad, because two runtimes double the adapters, the tests and the deployment documentation.

### Edge work as a Worker, lifecycle work only as a container inside the product's own cloud

* Good, because no lifecycle credential ever runs outside the product's boundary.
* Bad, because every adopter, audited or not, runs a container in a cloud of their own, which most
  small businesses do not have.

### Everything in the product's own cloud, with edge work behind its load balancer and CDN

* Good, because one cloud and one vendor sit in every request path, inside one audit scope.
* Bad, because a first visit makes a round trip to one region and, for a container that scales to
  zero, waits for a cold start, where a Worker answers from a city near the visitor.
* Bad, because traffic splitting built into a load balancer is assigned per request by the load
  balancer, not once per visitor by the experiments tool (`EXP-01`, `EXP-02`).

## More Information

**Reversal cost.** Moderate: the handlers are web-standard, so a second runtime is an adapter and its
tests, but the ledger would need a store on that runtime.

## Revisit when

* Adopters who cannot use Cloudflare for lifecycle work are common enough to warrant a second runtime.
* An adopter's auditor puts the edge's request path itself in scope, so a vendor there costs more
  than a slower first visit.
