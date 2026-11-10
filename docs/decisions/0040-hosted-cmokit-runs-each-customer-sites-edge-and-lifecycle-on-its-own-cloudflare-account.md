---
status: "proposed"
kind: "requirement-driven"
date: 2026-11-10
decision-makers: [Geoff]
---

# ADR-0040: Hosted CMOkit runs each customer site's edge and lifecycle on CMOkit's own Cloudflare account, one deployment per site

**Requirements served:** `HST-01`, `HST-11`, `HST-16`, `NFR-06`.

## Context and Problem Statement

The engine is deployed per site, to a Cloudflare account, from a repository that depends on the
published packages (ADR-0002, ADR-0003), with the site's configuration bundled at deploy (ADR-0008).
ADR-0016 kept the engine out of the hosted service: an adopter ran its own edge and lifecycle on its
own Cloudflare account.

Hosted CMOkit's customer is a content creator who is not a developer, with no Cloudflare account,
repository or terminal of their own (`HST-01`). A site's waitlist, referral links and messages are
edge and lifecycle work, so a hosted customer who had to run them would need all three, and the
hosted offering would give them no reason to choose it over running CMOkit themselves. So a hosted
customer's waitlist and messages are run for them (`HST-16`). Their site stays where they build and
host it.

CMOkit's own site, cmokit.ai, is the first site run this way. Its repository deploys its edge and
lifecycle to CMOkit's own Cloudflare account, beside the issuer and content server.

## Decision Drivers

* No Cloudflare account, repository or terminal for the customer (`HST-01`).
* What is hosted is what is open source, deployed the same way (`HST-11`).
* Every part scales to zero, so a quiet site costs nothing (`NFR-06`).
* The packages as they stand serve the first customer sites now, before the multi-tenant account
  page and subscriptions exist.

## Considered Options

* A deployment per customer site on CMOkit's own Cloudflare account, from a site repository CMOkit
  keeps
* One multi-tenant edge and lifecycle on CMOkit's account, each site's configuration read at run time
* The customer's own Cloudflare account, as for a self-hosted adopter
* A deployment per customer site through Workers for Platforms

## Decision Outcome

Chosen option: "A deployment per customer site on CMOkit's own Cloudflare account, from a site
repository CMOkit keeps", because it runs the published edge and lifecycle unchanged, with each
site's configuration bundled at deploy, and asks nothing of the customer's own.

> Hosted CMOkit runs a customer site's edge and lifecycle for it, on CMOkit's own Cloudflare account,
> deployed from a site repository CMOkit keeps, one deployment per site. The site itself stays where
> its owner builds and hosts it. A self-hosted adopter deploys the same packages to an account of its
> own, as before.

### Consequences

* Good, because nothing in the engine changes: a customer site is the same deployment a self-hosted
  adopter makes, so parity holds by construction (`HST-11`).
* Good, because a site that gets no traffic costs nothing (`NFR-06`).
* Bad, because a Worker route or custom domain needs the site's zone on CMOkit's account, so the
  customer's domain has to be added there and its nameservers pointed at Cloudflare.
* Bad, because each new customer site is a repository and a deploy that CMOkit's operator makes by
  hand.
* Neutral, because each site's waitlist, leads and messages are already apart from every other
  site's, since each deployment has Durable Objects of its own.

### Confirmation

Enforced by review: a customer site's repository depends only on the published packages and deploys
to CMOkit's account, and nothing in the packages is specific to hosted sites.

## Pros and Cons of the Options

### A deployment per customer site on CMOkit's own Cloudflare account, from a site repository CMOkit keeps

* Good, because it meets every driver with code that exists.
* Bad, because the customer's zone moves to CMOkit's account, and onboarding a site is manual.

### One multi-tenant edge and lifecycle on CMOkit's account, each site's configuration read at run time

* Good, because a new site is data, not a deployment, and a customer's domain can point at CMOkit by
  one record through Cloudflare for SaaS custom hostnames.
* Bad, because the edge and lifecycle read their configuration at deploy (ADR-0008), so both would
  need configuration per site at run time and checks that keep each site's state apart, before
  anything ships.

### The customer's own Cloudflare account, as for a self-hosted adopter

* Good, because the customer would own every byte of their site's data.
* Bad, because it needs a Cloudflare account, a repository and a deploy of the customer's own, which
  `HST-01` rules out and which would leave no reason to pay for the hosted offering.

### A deployment per customer site through Workers for Platforms

* Good, because each site's Workers would be separate scripts under one platform.
* Bad, because it costs a monthly fee before the first site (ADR-0016), and a deployment per site on
  the account already separates each site's state.

## More Information

**Follow-on obligations.** A how-to for adding a customer site: its repository, its zone on CMOkit's
account, and its deploy. ADR-0016's account of what is hosted points here.

**Reversal cost.** Moderate: moving to one multi-tenant edge and lifecycle keeps the handlers and
moves each site's objects; moving a site to its owner's account is a redeploy there and a DNS change.

## Revisit when

* Adding a customer site by hand takes more of the operator's time than building run-time
  configuration would.
* A customer cannot or will not move their domain's zone to CMOkit's account.
