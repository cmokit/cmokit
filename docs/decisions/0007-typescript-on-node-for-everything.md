---
status: "proposed"
kind: "substrate"
date: 2026-10-11
decision-makers: [Geoff]
---

# ADR-0007: TypeScript on Node for everything

## Context and Problem Statement

CMOkit is an Astro integration, Cloudflare Workers, a command line, a starter,
an MCP server, and the scripts and checks that keep its documents honest. Every one of those runs
JavaScript or has its best-supported toolchain in it: Astro and Workers are JavaScript runtimes, and
npm is where CMOkit is published. Something has to decide whether everything is written in one
language, and which.

Contributors are mostly agents, and adopters read the code they depend on. A second language costs
both a second toolchain to install, a second set of conventions and a second dependency graph to
audit.

## Decision Drivers

* One toolchain to install, for a contributor and for CI.
* Types checked across the boundaries between packages, which are published interfaces.
* Scripts and checks run without a build step.
* The runtimes the packages already target.

## Considered Options

* TypeScript on Node, for packages, scripts and checks alike
* JavaScript without types
* TypeScript for packages, and another language for scripts and tooling
* TypeScript on Deno or Bun

## Decision Outcome

Chosen option: "TypeScript on Node, for packages, scripts and checks alike", because it is the
language every runtime CMOkit targets already runs, and it types the interfaces CMOkit publishes.

> Everything in this repository is TypeScript, run on Node 24 or later, managed as npm workspaces.
> Only TypeScript that Node can run by stripping types is written — no enums, namespaces or
> parameter properties — so scripts and checks run directly with `node`, with no build step, and
> the compiler only checks. A second language arrives only with a record of its own.

### Consequences

* Good, because one `npm ci` sets up everything a contributor or CI needs.
* Good, because a script is a `.ts` file Node runs as it is.
* Bad, because the few TypeScript features that need emitting code are unavailable.
* Neutral, because packages still choose for themselves how they are built for publishing.

### Confirmation

CI runs `tsc` over the repository with `erasableSyntaxOnly`, so any syntax Node cannot strip fails
the build. The repository holds no manifest for another language's package manager.

## Pros and Cons of the Options

### TypeScript on Node, for packages, scripts and checks alike

* Good, because it meets every driver.
* Bad, because Node's type stripping limits which TypeScript syntax is written.

### JavaScript without types

* Good, because nothing needs checking or stripping.
* Bad, because the configuration and the packages' options are published interfaces, and without
  types an adopter or an agent learns a mistake only when it runs.

### TypeScript for packages, and another language for scripts and tooling

* Good, because a contributor fluent in that language writes tooling faster in it.
* Bad, because every contributor and CI then installs and keeps current a second toolchain, for
  scripts small enough to write in the first.

### TypeScript on Deno or Bun

* Good, because both run TypeScript natively, with more of its syntax.
* Bad, because Astro, the command line and npm publishing are all Node first, so a second runtime would
  sit beside Node rather than replace it.

## More Information

**Reversal cost.** Low for scripts, which are small. High for packages, whose published types
adopters depend on.

## Revisit when

* A job CMOkit must do in-house has a library worth having only in another language.
* Node's type stripping supports the TypeScript syntax it now refuses, so the restriction can lift.
