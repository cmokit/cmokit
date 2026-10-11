---
status: "proposed"
kind: "requirement-driven"
date: 2026-10-11
decision-makers: [Geoff]
---

# ADR-0003: The edge runs as a Worker, and lifecycle work as a container inside the product's boundary

**Requirements served:** `SRV-03`, `MSR-03`, `LEAD-02`, `SUB-06`, `CRD-01`, `PRD-03`, `NFR-02`, `NFR-05`.

## Context and Problem Statement

CMOkit has one server part. It has two kinds of work:

* **Edge work, in front of the site:** resolving a visitor's variant before the page is sent
  (`SRV-03`), and recording the conversion server-side (`MSR-03`). It must sit in the request path
  between the visitor and the static site.
* **Lifecycle work, off the request path:** capturing leads with a secret that can write to the
  messaging tool (`LEAD-02`), receiving the payment processor's signed events (`SUB-06`) and the
  product's signed usage events (`CRD-01`), and calling the product with a client credential that can
  pause its customers (`PRD-03`).

Edge work needs no storage. A visitor's variant is a cookie in their own browser, assigned from the
experiments tool's configuration; the variants are pages of the static site; the server-side
conversion is passed on to analytics. All of CMOkit's stored state belongs to lifecycle work, in
Postgres (ADR-0006).

CMOkit is deployed inside a product's existing audit boundary. A credential that can pause every
customer of a product belongs inside it: for a product audited under SOC 2, wherever that credential
runs is in scope for the product's controls, so running it on a second cloud brings that cloud into
scope. The same holds for the database that keeps CMOkit's state.

## Decision Drivers

* Variant resolution is in the request path, with no flash of the default (`SRV-03`), and is fast
  for a visitor's first page wherever they are.
* The lifecycle credential and CMOkit's database sit inside the product's own boundary (`NFR-02`).
* One code base, not two implementations of the same logic.
* One supported way to run each kind of work, so each is tested the way it is deployed.
* Secrets come from the deploying environment (`NFR-05`).

## Considered Options

* Edge work as a Worker, lifecycle work as a container, both written to web-standard handlers
* One server part deployable as a Worker or a container, with lifecycle work in either
* Everything in a Cloudflare Worker
* Everything in the product's own cloud, with edge work behind its load balancer and CDN
* Edge work and lifecycle work written apart

## Decision Outcome

Chosen option: "Edge work as a Worker, lifecycle work as a container, both written to web-standard
handlers", because it answers a visitor's first page near them and keeps every credential and all
stored state inside the product's boundary, from one code base.

> The server part is written against the web-standard `Request` and `Response`, with no runtime's
> own APIs in its handlers. Edge work runs only as a Cloudflare Worker and keeps no state. Lifecycle
> work runs only as a container, on the container platform of the product's own cloud, inside the
> product's audit boundary. Lifecycle's public endpoints — the payment processor's events, and lead capture,
> which the Worker proxies from the site's own domain — are reached through the boundary's own front
> door and firewall. The product reaches the usage endpoint from inside the boundary only.

### Consequences

* Good, because a visitor's first page is resolved in a city near them, with no cold start.
* Good, because nothing outside the product's boundary holds a lifecycle credential or reaches
  CMOkit's database.
* Good, because each kind of work has one adapter, tested as it is deployed.
* Bad, because a deployment has a second vendor, Cloudflare, in its visitors' request path, though
  not in the path of any credential or stored state.

### Confirmation

Edge handler tests run on the Worker adapter and lifecycle handler tests on the container adapter, in
CI, with no account at any bought tool (`NFR-04`). A check fails the build if `@cmokit/edge` depends,
directly or through another package, on `@cmokit/lifecycle` or a database client.

## Pros and Cons of the Options

### Edge work as a Worker, lifecycle work as a container, both written to web-standard handlers

* Good, because it meets every driver.
* Bad, because it forgoes Worker-only conveniences in lifecycle work.

### One server part deployable as a Worker or a container, with lifecycle work in either

* Good, because lifecycle work could run beside the edge, with one less thing to deploy.
* Bad, because a Worker reaches Postgres only over the internet, so CMOkit's database would be
  exposed beyond the boundary that holds it, and the lifecycle credential would run outside it.
* Bad, because lifecycle work would be supported on two runtimes, doubling what is tested.

### Everything in a Cloudflare Worker

* Good, because it is one deployment, at the edge, with no server to run.
* Bad, because a product audited under SOC 2 then has a credential that can pause its customers, and
  the database behind it, on another provider, which brings that provider into scope.

### Everything in the product's own cloud, with edge work behind its load balancer and CDN

* Good, because one cloud and one vendor sit in every request path, inside one audit scope.
* Good, because a product that already runs a load balancer with a firewall adds only a routing rule
  and a container kept warm for first visits.
* Bad, because a first visit makes a round trip to one region and, without an instance kept warm,
  waits for a cold start, where a Worker answers from a city near the visitor.
* Bad, because a cloud's own programmable load-balancer extensions, such as Google Cloud's Service
  Extensions plugins, are WebAssembly written in Rust, Go or C++, so using them would write variant
  resolution a second time; the container adapter avoids that, but only by adding the round trip.
* Bad, because traffic splitting built into a load balancer is assigned per request by the load
  balancer, not once per visitor by the experiments tool (`EXP-01`, `EXP-02`), and changing it is an
  infrastructure change rather than a content change (`SRV-02`).

### Edge work and lifecycle work written apart

* Good, because each part uses its runtime fully.
* Bad, because shared logic — identity, event verification, configuration — is written twice and
  drifts.

## More Information

**Reversal cost.** Low to move edge work into a container, since its handlers are web-standard
already. Moderate to let lifecycle work run in a Worker again, which would need a way to reach
Postgres from outside the boundary.

## Revisit when

* Cloudflare is inside an adopter's audited boundary already.
* An adopter's auditor puts the edge's request path in scope, so a second vendor there costs more than
  a slower first visit.
