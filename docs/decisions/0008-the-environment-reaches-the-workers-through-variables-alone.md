---
status: "proposed"
kind: "requirement-driven"
date: 2026-10-24
decision-makers: [Geoff]
---

# ADR-0008: The deploying environment reaches the Workers through variables and secrets alone

**Requirements served:** `NFR-01`, `NFR-04`, `NFR-05`, `AGT-06`, `SUB-05`, `CRD-02`, `EXP-06`.

## Context and Problem Statement

CMOkit runs as Cloudflare Workers (ADR-0003), deployed from a repository of the adopter's own
(ADR-0002). Two kinds of setting reach them. CMOkit's configuration — plans, credit grants,
experiments, the calls to the product — is reviewed like code (`SUB-05`, `CRD-02`, `EXP-06`). The
rest differs by environment: the addresses CMOkit calls, and secrets, which only the deploying
environment holds (`NFR-05`). A contributor or an agent has to run both Workers locally with no
account (`NFR-04`, `AGT-06`), and an adopter upgrades by changing a version (`NFR-01`).

## Decision Drivers

* What changes what visitors and customers get is reviewed.
* Secrets reach the Workers from the deploying environment and nowhere else (`NFR-05`).
* One list of everything a deployment must supply.
* Local runs shaped like production, with no account (`NFR-04`, `AGT-06`).

## Considered Options

* CMOkit's configuration bundled into the Workers at deploy; Worker variables and secrets for the
  rest, listed in one reference
* Everything, the configuration included, in Worker variables
* The configuration read at runtime from a store, editable without a deploy

## Decision Outcome

Chosen option: "CMOkit's configuration bundled into the Workers at deploy; Worker variables and
secrets for the rest, listed in one reference", because what is reviewed then ships as reviewed, and
a deployment supplies only what differs by environment.

> CMOkit's configuration lives in the adopter's repository and is bundled into the Workers when they
> are deployed; it holds no secret. Everything else is a Worker variable or secret, which the deploy
> sets from the deploying environment's own secret store, and the adapters read it from the Worker's
> environment and pass it to the handlers. CMOkit reads nothing else from its environment. Every
> variable and secret is listed in one reference document, and that list is the contract a
> deployment meets. Locally, Wrangler runs both Workers and their Durable Objects with the same
> variables, from a file that is never committed.

### Consequences

* Good, because a deployed Worker always matches a reviewed commit and the environment it was given.
* Good, because one reference document says everything an adopter must supply.
* Bad, because changing the configuration takes a deploy, which takes seconds.
* Bad, because the variable list is a published contract, and changing its shape is a breaking change.

### Confirmation

CI runs the adapters' tests under Wrangler with stand-ins for every bought tool, with no account. A
check fails the build if an adapter reads a variable or secret the reference document does not list.

## Pros and Cons of the Options

### CMOkit's configuration bundled into the Workers at deploy; Worker variables and secrets for the rest, listed in one reference

* Good, because it meets every driver.
* Bad, because every configuration change is a deploy.

### Everything, the configuration included, in Worker variables

* Good, because there is one place for every setting.
* Bad, because plans, grants and experiments are structured and reviewed, and as variables they would
  be set outside review and validated only at runtime.

### The configuration read at runtime from a store, editable without a deploy

* Good, because a change takes effect without a deploy.
* Bad, because a change is then unreviewed (`EXP-06`), and what runs can drift from the repository.

## More Information

**Reversal cost.** Low: moving a setting between the configuration and the variables changes the
reference document and the adapters, not the handlers.

## Revisit when

* Adopters need a setting changed faster than a deploy allows.
