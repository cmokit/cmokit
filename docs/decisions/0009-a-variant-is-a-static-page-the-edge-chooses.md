---
status: "proposed"
kind: "requirement-driven"
date: 2026-10-23
decision-makers: [Geoff]
---

# ADR-0009: A variant is a static page, and the edge chooses which one a visitor is served

**Requirements served:** `SRV-01`, `SRV-02`, `SRV-03`, `SRV-04`, `EXP-01`, `EXP-03`, `EXP-04`,
`MSR-01`, `MSR-03`.

## Context and Problem Statement

A CMOkit site is static, built from its repository and served by a static host (`SRV-01`). A page
under experiment has several variants, and a visitor must see their own on first paint, with no
flash of another (`SRV-03`), and keep it across visits (`EXP-01`). Adding or retiring a variant must
be a content change (`SRV-02`, `EXP-03`), and the site must still work, showing its default, when the
experiments tool is unreachable (`SRV-04`). Something has to decide where a variant's content lives,
where a visitor's variant is decided, and how the edge, which keeps no state (ADR-0003), learns which
pages are under experiment.

## Decision Drivers

* No flash of the default, and no client-side code deciding what the page says.
* A variant is a page in the site's repository, written and previewed like any other.
* The experiments tool assigns variants and judges them (`EXP-02`); CMOkit stores no assignment.
* A failure anywhere serves the default page.
* One place configures an experiment, read by the build and by the edge alike.

## Considered Options

* Each variant built as its own static page; the edge serves the visitor's variant at the page's own
  address, reading the experiments from a manifest the build publishes
* One page holding every variant, with a script showing one
* The edge rewriting the default page's HTML for each variant
* Experiments compiled into the Worker at deploy

## Decision Outcome

Chosen option: "Each variant built as its own static page; the edge serves the visitor's variant at
the page's own address, reading the experiments from a manifest the build publishes", because it is
the only option that is static, flash-free and a content change at once.

> An experiment names a flag, the page under experiment, and a page for each variant other than the
> control, which is the page itself. The build fails if a variant's page does not exist, and publishes
> the experiments as a manifest beside the site. The edge reads the manifest from the site, asks the
> experiments tool for a visitor's variant once, keeps the answer in a cookie, fetches that variant's
> page from the site and serves it at the page's own address, uncached. It records an exposure each
> time it serves an experiment's page. A variant's own address redirects to the page under
> experiment, so it is reached only through assignment; a preview parameter shows any variant without
> assigning or recording anything. Visitors the edge takes for agents get the control, with no cookie
> and no exposure. Whenever the manifest, the tool or a variant's page fails, the visitor gets the
> control, unassigned.

### Consequences

* Good, because a variant is an ordinary page of the site, which a person or an agent writes and
  previews like any other.
* Good, because a new or retired variant reaches visitors with the site's next deploy, without
  redeploying the edge.
* Good, because every failure degrades to the page the site would have served without CMOkit.
* Bad, because an experiment's page is never cached in front of the site, so each view of it is a
  fetch from the static host.
* Bad, because the manifest is cached briefly by the edge and the host, so a change to an experiment
  reaches visitors minutes after the deploy rather than at once.

### Confirmation

Tests of the edge handler cover assignment, a sticky cookie, an unreachable tool, a missing variant
page, an agent, a variant's own address, a preview and a conversion, against stand-ins for the tool
and the site. The integration's build fails when a configured variant page was not built.

## Pros and Cons of the Options

### Each variant built as its own static page; the edge serves the visitor's variant at the page's own address, reading the experiments from a manifest the build publishes

* Good, because it meets every driver.
* Bad, because pages under experiment are fetched from the host on every view.

### One page holding every variant, with a script showing one

* Good, because it needs no edge at all.
* Bad, because the page flashes, or hides itself until the script runs, which is the flash by another
  name (`SRV-03`), and a visitor whose script is blocked sees every variant or none.

### The edge rewriting the default page's HTML for each variant

* Good, because only the parts that differ are written down.
* Bad, because a variant is then a set of rewriting rules rather than a page, which neither a person
  nor an agent can preview by opening it, and a change to the default page can silently break them.

### Experiments compiled into the Worker at deploy

* Good, because the edge never fetches the manifest.
* Bad, because the Worker and the site then deploy separately and can disagree about which variant
  pages exist, and every change to an experiment means deploying the edge.

## More Information

**Reversal cost.** Low: the manifest's shape is the only interface between the build and the edge.

## Revisit when

* Fetching pages under experiment from the static host costs a visitor noticeable time.
* An adopter needs variants that differ by visitor rather than by assignment, such as by country.
