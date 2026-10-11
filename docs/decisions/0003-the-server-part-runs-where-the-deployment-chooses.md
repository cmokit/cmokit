---
status: "proposed"
kind: "requirement-driven"
date: 2026-10-11
decision-makers: [Geoff]
---

# ADR-0003: The server part runs where the deployment chooses

**Requirements served:** `SRV-03`, `MSR-03`, `LEAD-02`, `SUB-06`, `PRD-03`, `NFR-02`, `NFR-05`.

## Context and Problem Statement

CMOkit has one server part. It has two kinds of work:

* **Edge work, in front of the site:** resolving a visitor's variant before the page is sent
  (`SRV-03`), and recording the conversion server-side (`MSR-03`). It must sit in the request path
  between the visitor and the static site, which for a GitHub Pages site behind Cloudflare means a
  Cloudflare Worker.
* **Lifecycle work, off the request path:** capturing leads with a secret that can write to the
  messaging tool (`LEAD-02`), receiving the payment processor's signed events (`SUB-06`), and calling
  the product with a client credential that can pause its customers (`PRD-03`).

A credential that can pause every customer of a product belongs inside that product's security
boundary. For a product audited under SOC 2, wherever that credential runs is in scope for the
product's controls, so running it on a second cloud brings that cloud into scope.

## Decision Drivers

* Variant resolution is in the request path, with no flash of the default (`SRV-03`).
* The lifecycle credential can run inside the product's own boundary (`NFR-02`).
* One code base, not two implementations of the same handlers.
* Secrets come from the deploying environment (`NFR-05`).

## Considered Options

* One server part written to web-standard request handlers, deployable as a Worker or a container
* Everything in a Cloudflare Worker
* Edge work in a Worker, lifecycle work as a separate service written apart

## Decision Outcome

Chosen option: "One server part written to web-standard request handlers, deployable as a Worker or
a container", because it lets each deployment put the lifecycle credential where its boundary is,
with one code base.

> The server part is written against the web-standard `Request` and `Response`, with no runtime's
> own APIs in its handlers. It ships with two adapters: a Cloudflare Worker, and a container image for
> any host that runs one. Edge work runs as a Worker. Lifecycle work runs in either, and a deployment
> whose product has a security boundary runs it inside that boundary.

### Consequences

* Good, because a deployment with no audit boundary runs everything in one Worker.
* Good, because a deployment with one runs the lifecycle work in its own cloud, beside its product.
* Bad, because the handlers cannot use a Worker's own storage or bindings, and keep no state of
  their own.
* Bad, because two adapters are tested and released.

### Confirmation

The handler tests run on both adapters in CI, with no account at any bought tool (`NFR-04`).

## Pros and Cons of the Options

### One server part written to web-standard request handlers, deployable as a Worker or a container

* Good, because it meets every driver.
* Bad, because it forgoes Worker-only conveniences.

### Everything in a Cloudflare Worker

* Good, because it is one deployment, at the edge, with no server to run.
* Bad, because a product audited under SOC 2 then has a credential that can pause its customers
  running on another provider, which brings that provider into scope.

### Edge work in a Worker, lifecycle work as a separate service written apart

* Good, because each part uses its runtime fully.
* Bad, because shared logic — identity, event verification, configuration — is written twice and
  drifts.

## More Information

**Reversal cost.** Low for a deployment, which moves between adapters by configuration. Moderate for
CMOkit, which would have to rewrite handlers to take up a runtime's own APIs.

## Revisit when

* A handler needs state that cannot live in a bought tool or the payment processor.
* Cloudflare is inside an adopter's audited boundary already, so the second adapter buys them nothing.
