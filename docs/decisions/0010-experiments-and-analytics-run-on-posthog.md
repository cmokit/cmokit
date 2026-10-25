---
status: "proposed"
kind: "requirement-driven"
date: 2026-10-23
decision-makers: [Geoff]
---

# ADR-0010: Experiments and analytics run on PostHog, behind interfaces named for each job

**Requirements served:** `EXP-02`, `MSR-01`, `MSR-03`, `MSR-04`, `MSR-05`, `NFR-03`, `NFR-04`.

## Context and Problem Statement

CMOkit assigns no variant and judges no experiment itself: an experiments tool does both, with its
own statistics (`EXP-02`). Visits, exposures and conversions have to land in an analytics tool that
reads conversion and revenue by channel and variant without a warehouse (`MSR-05`), following one
identity from first visit to payment (`MSR-04`), with the conversion recorded server-side too
(`MSR-03`). Every bought tool sits behind an interface named for its job (`NFR-03`). Something has to
choose the first tool to put behind those interfaces.

## Decision Drivers

* Assignment and experiment statistics with no warehouse to run.
* Exposures and conversions recorded from the edge, by a plain HTTP API a Worker can call.
* One identity across the edge, the browser and, later, the lifecycle.
* A free tier a new site can start on.
* Swappable: no vendor's name outside the adapter that speaks to it.

## Considered Options

* PostHog, for experiments and analytics both
* GrowthBook for experiments, with a separate analytics tool
* Statsig
* An experiments engine of CMOkit's own

## Decision Outcome

Chosen option: "PostHog, for experiments and analytics both", because one tool assigns variants,
judges them and holds the funnel they are judged by, over an API the edge calls directly.

> The edge and the integration speak to two interfaces, experiments (a visitor's variant of a flag)
> and analytics (capturing an event for a visitor, and relaying the browser's events), and PostHog
> implements both in one adapter per package. The visitor's identity is CMOkit's own cookie, used as
> PostHog's distinct id by the edge and bootstrapped into the browser's PostHog client, which
> evaluates no flags itself and records no exposures. The browser's events reach PostHog through the
> edge, under the site's own address. Tests run against stand-ins for the interfaces, with no PostHog
> account.

### Consequences

* Good, because exposures, conversions and pageviews land in one place, under one identity.
* Good, because relaying the browser's events through the site's own address keeps blockers of
  analytics domains from losing them.
* Bad, because one vendor holding both jobs makes leaving it two migrations at once.
* Neutral, because the project key the adapters use is public by design, so the edge's bundled
  configuration and the page may carry it.

### Confirmation

A check fails the build if the edge handler names a bought tool; only its adapters and the Worker
that wires them do. Tests of the edge and the integration use stand-ins for the interfaces.

## Pros and Cons of the Options

### PostHog, for experiments and analytics both

* Good, because it meets every driver.
* Bad, because a flag evaluated from the edge is a network call on a visitor's first view of an
  experiment's page.

### GrowthBook for experiments, with a separate analytics tool

* Good, because it is open source and evaluates flags inside the Worker with no network call.
* Bad, because its statistics read from a warehouse or its managed one (`MSR-05`), and a second tool
  holds the funnel, so identity has to be joined across two vendors.

### Statsig

* Good, because its statistics are strong and it has an SDK for the edge.
* Bad, because it is weaker as the analytics tool for revenue by channel, which would mean a second
  tool again.

### An experiments engine of CMOkit's own

* Good, because it would need no vendor.
* Bad, because `EXP-02` leaves the statistics to a tool, and CMOkit would then store assignments,
  which the edge cannot.

## More Information

**Reversal cost.** Moderate: a new adapter per interface, and history left behind in PostHog.

## Revisit when

* The flag call from the edge costs first visits noticeable time.
* PostHog's free tier no longer covers a typical site's experiment traffic.
