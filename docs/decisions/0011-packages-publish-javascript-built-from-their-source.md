---
status: "proposed"
kind: "substrate"
date: 2026-10-23
decision-makers: [Geoff]
---

# ADR-0011: Packages publish JavaScript built from their TypeScript, and the repository runs the source

## Context and Problem Statement

Everything is TypeScript that Node runs by stripping types (ADR-0007). Node refuses to strip types
from files under `node_modules`, and tools that load a dependency natively, such as Astro loading an
integration, do the same. A package published as TypeScript alone cannot be used by most adopters.
Inside this repository, though, packages import each other, and contributors and tests should not
have to build one package before another can be tested.

## Decision Drivers

* An adopter installs packages that run on Node and in bundlers without any type stripping.
* Inside the repository, tests and type checks run against source, with no build step first.
* What is published is built in CI from the commit it is released from.

## Considered Options

* Build JavaScript and declarations per package for publishing; resolve the source in the repository
  by a package export condition
* Publish TypeScript source only
* Build every package before every test run

## Decision Outcome

Chosen option: "Build JavaScript and declarations per package for publishing; resolve the source in
the repository by a package export condition", because adopters get plain JavaScript and the
repository never waits on a build.

> Each package keeps its source in `src/` and builds `dist/` with `tsc`, rewriting relative `.ts`
> imports to `.js`. Its exports point at `dist/`, and first at `src/` under the `cmokit-source`
> condition, which the repository's type check and test runs set. The publish workflow builds every
> package before staging it.

### Consequences

* Good, because an adopter's tools load plain JavaScript.
* Good, because a test in one package runs against the current source of the others.
* Bad, because a published package's behavior depends on a build the repository's tests do not run;
  the starter's build in CI is what catches a broken one.

### Confirmation

CI builds every package and then builds the starter site against the built packages.

## Pros and Cons of the Options

### Build JavaScript and declarations per package for publishing; resolve the source in the repository by a package export condition

* Good, because it meets every driver.
* Bad, because each package carries a build configuration.

### Publish TypeScript source only

* Good, because nothing is built.
* Bad, because Node will not strip types under `node_modules`, so an adopter's Astro config could not
  load the integration.

### Build every package before every test run

* Good, because tests run exactly what is published.
* Bad, because every test run waits on a build, and a stale `dist/` silently tests old code.

## More Information

**Reversal cost.** Low: a package's exports are the only thing that names `dist/`.

## Revisit when

* Node strips types under `node_modules`.
