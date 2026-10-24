---
status: "proposed"
kind: "requirement-driven"
date: 2026-10-23
decision-makers: [Geoff]
---

# ADR-0009: A variant is a page of the site, and the edge chooses which one a visitor is served

**Requirements served:** `SRV-01`, `SRV-02`, `SRV-03`, `SRV-04`, `EXP-01`, `EXP-03`, `EXP-04`,
`MSR-01`, `MSR-03`.

## Context and Problem Statement

A CMOkit site may be built with any static site generator or CMS and hosted anywhere (`SRV-01`). A
page under experiment has several variants, and a visitor must see their own on first paint, with no
flash of another (`SRV-03`), and keep it across visits (`EXP-01`). Adding or retiring a variant must
be a content change (`SRV-02`, `EXP-03`), and the site must still work, showing its default, when the
experiments tool is unreachable (`SRV-04`). Something has to decide where a variant's content lives,
where a visitor's variant is decided, and how the edge, which keeps no state (ADR-0003), learns which
pages are under experiment.

Many sites have no build CMOkit can take part in: a page made in a CMS is published by the CMS. What
every site has is pages at addresses.

## Decision Drivers

* No flash of the default, and no client-side code deciding what the page says.
* A variant is a page of the site, written and previewed like any other, on any platform.
* The experiments tool assigns variants and judges them (`EXP-02`); CMOkit stores no assignment.
* A failure anywhere serves the default page.
* One place configures an experiment, and it does not depend on how the site is built.

## Considered Options

* Each variant is its own page of the site; the edge serves the visitor's variant at the page's own
  address, reading the experiments from the configuration deployed with it
* Each variant is its own page; the edge reads the experiments from a manifest the site's build
  publishes
* One page holding every variant, with a script showing one
* The edge rewriting the default page's HTML for each variant

## Decision Outcome

Chosen option: "Each variant is its own page of the site; the edge serves the visitor's variant at
the page's own address, reading the experiments from the configuration deployed with it", because it
is flash-free, a content change, and asks nothing of how the site is built.

> An experiment names a flag, the page under experiment, and a page for each variant other than the
> control, which is the page itself. The experiments are CMOkit configuration, deployed with the
> edge. The edge asks the experiments tool for a visitor's variant once, keeps the answer in a cookie,
> fetches that variant's page from the site and serves it at the page's own address, uncached. It
> records an exposure each time it serves an experiment's page. A variant's own address redirects to
> the page under experiment, so it is reached only through assignment; a preview parameter shows any
> variant without assigning or recording anything. Visitors the edge takes for agents get the
> control, with no cookie and no exposure. Whenever the tool or a variant's page fails, the visitor
> gets the control, unassigned. A site builder's integration, where there is one, also fails the
> site's build when a configured variant page was not built.

### Consequences

* Good, because a variant is an ordinary page of the site, which a person or an agent writes and
  previews like any other, in whatever the site is built with.
* Good, because every failure degrades to the page the site would have served without CMOkit.
* Bad, because starting or retiring an experiment deploys the edge, which is a second deploy when the
  site and its configuration live in different places. The deploy is the configuration
  repository's own workflow, and takes seconds.
* Bad, because a variant page that does not exist yet is found only when a visitor is assigned to it,
  unless an integration checks the build. The visitor is served the control, and no exposure is
  recorded.
* Bad, because an experiment's page is never cached in front of the site, so each view of it is a
  fetch from the host.

### Confirmation

Tests of the edge handler cover assignment, a sticky cookie, an unreachable tool, a missing variant
page, an agent, a variant's own address, a preview and a conversion, against stand-ins for the tool
and the site. The Astro integration's build fails when a configured variant page was not built.

## Pros and Cons of the Options

### Each variant is its own page of the site; the edge serves the visitor's variant at the page's own address, reading the experiments from the configuration deployed with it

* Good, because it meets every driver.
* Bad, because a change to an experiment is a deploy of the edge.

### Each variant is its own page; the edge reads the experiments from a manifest the site's build publishes

* Good, because a new or retired variant reaches visitors with the site's own deploy.
* Good, because the build checks every variant page exists before the manifest names it.
* Bad, because only a site whose build CMOkit takes part in can publish the manifest, which rules out
  most CMSs (`SRV-01`).

### One page holding every variant, with a script showing one

* Good, because it needs no edge at all.
* Bad, because the page flashes, or hides itself until the script runs, which is the flash by another
  name (`SRV-03`), and a visitor whose script is blocked sees every variant or none.

### The edge rewriting the default page's HTML for each variant

* Good, because only the parts that differ are written down.
* Bad, because a variant is then a set of rewriting rules rather than a page, which neither a person
  nor an agent can preview by opening it, and a change to the default page can silently break them.

## More Information

**Reversal cost.** Low: reading the experiments from a manifest the site publishes, where the site can
publish one, is an addition beside the configuration the edge is deployed with.

## Revisit when

* Fetching pages under experiment from the host costs a visitor noticeable time.
* An adopter needs variants that differ by visitor rather than by assignment, such as by country.
* Adopters change experiments often enough that deploying the edge for each change is a burden.
