---
status: "proposed"
kind: "requirement-driven"
date: 2026-10-11
decision-makers: [Geoff]
---

# ADR-0002: The engine is a dependency, and a site is content

**Requirements served:** `SRV-01`, `SRV-02`, `NFR-01`, `LOOP-01`.

## Context and Problem Statement

CMOkit serves many businesses, each with its own site, copy, design and offers. Something has to
decide how a business's site relates to CMOkit's code: whether a site is a copy of CMOkit, a layer on
top of it, or something that depends on it. The answer decides how a site gets CMOkit's fixes, where
an agent proposing variants writes, and what an adopter owns.

A site may be built with any static site generator or CMS and hosted anywhere (`SRV-01`). The parts
CMOkit supplies are its configuration and a command line, a browser script the edge serves and any
site includes with one tag, integrations for site builders that want one (the first is Astro's), a
server part in two pieces deployed apart (ADR-0003) — the edge (variant resolution, the server-side
conversion) and the lifecycle (lead capture, the payment processor's events, the credit ledger, the
product's usage events, the calls to the product) — reusable deployment workflows, and an agent
plugin for the weekly loop.

## Decision Drivers

* An adopter gets CMOkit's fixes by changing a version, not by merging (`NFR-01`).
* A variant is a content change in the adopter's site (`SRV-02`, `LOOP-01`).
* An adopter owns everything that is theirs, and nothing that is not.

## Considered Options

* CMOkit as published packages a site depends on, with a starter that creates a new site
* A template repository each site is created from
* A fork of CMOkit per site

## Decision Outcome

Chosen option: "CMOkit as published packages a site depends on, with a starter that creates a new
site", because it is the only option in which a fix reaches every site as a version change.

> CMOkit is published as packages. On npm: `@cmokit/cli` (configuration and the `cmokit` command),
> `@cmokit/astro` (the Astro integration), `@cmokit/edge` and `@cmokit/lifecycle` (the two pieces of
> the server part, one package each so that neither carries the other's dependencies), and
> `create-cmokit` (the starter). The deployment workflows are reusable GitHub Actions workflows, and
> the weekly loop is an agent plugin. A site is the adopter's own, built and hosted however they
> choose. Its CMOkit configuration lives in a repository of the adopter's own that depends on those
> packages and deploys the edge; for a site kept in git it is the site's own repository. The starter
> creates a new site, and is not depended on after.

### Consequences

* Good, because a fix reaches every site through a version change.
* Good, because the adopter's repository holds only their content, which is where the weekly loop
  writes.
* Bad, because the configuration and the integration's options are a published interface with
  compatibility obligations of their own.
* Neutral, because a site that needs something CMOkit does not do adds it in its own repository.

### Confirmation

The starter is built and deployed in CI against the current packages, so a release that breaks a
fresh site fails before it is published.

## Pros and Cons of the Options

### CMOkit as published packages a site depends on, with a starter that creates a new site

* Good, because it meets every driver.
* Bad, because it needs package releases and versioning from the start.

### A template repository each site is created from

* Good, because an adopter starts with a working site in one click and owns every line.
* Bad, because a fix after creation reaches a site only by hand, and every site drifts from the
  template on its first day.

### A fork of CMOkit per site

* Good, because upstream fixes arrive by merge.
* Bad, because content and engine share one repository, so every merge risks the adopter's content
  and the weekly loop writes into a tree it does not own.

## More Information

The unscoped name `cmokit` cannot be published: npm refuses it as too close to existing package
names, for everyone. A site reaches the `cmokit` command through `@cmokit/cli`, which the starter
installs.

**Reversal cost.** Moderate: moving from packages to a template means every site copies the engine in.

## Revisit when

* An adopter needs to change the integration's behavior so often that a fork would cost them less.
