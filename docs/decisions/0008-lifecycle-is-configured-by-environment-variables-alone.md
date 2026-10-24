---
status: "proposed"
kind: "requirement-driven"
date: 2026-10-11
decision-makers: [Geoff]
---

# ADR-0008: Lifecycle work is configured by environment variables alone, and its container is one image the deployment builds

**Requirements served:** `NFR-01`, `NFR-02`, `NFR-04`, `NFR-05`, `NFR-06`, `AGT-06`, `CRD-01`, `SUB-06`.

## Context and Problem Statement

Lifecycle work runs as a Cloudflare Worker by default, or as a container that scales to zero inside an
audited product's boundary (ADR-0003). Its one store, the credit ledger, stays on Cloudflare either
way (ADR-0006), so a container has one thing to run: the service that receives the payment
processor's webhook events and the product's usage events and calls the product. A deployment has
to configure it the same way on either runtime, and a contributor or an agent has to run it locally
with no account (`NFR-04`, `AGT-06`). A deployment that runs the
container builds and deploys it in a pipeline it already runs and audits.

## Decision Drivers

* One way to configure lifecycle work, whichever runtime runs it.
* Nothing in CMOkit chooses a cloud; the deployment supplies everything (`NFR-02`).
* Secrets reach lifecycle work from the environment and nowhere else (`NFR-05`).
* What runs locally and in CI is shaped like what runs in production.
* An upgrade is a version change (`NFR-01`).

## Considered Options

* Environment variables alone on either runtime, with one container image the deployment builds from
  pinned versions
* A configuration file shipped with the deployment
* A published CMOkit image that a deployment runs unchanged

## Decision Outcome

Chosen option: "Environment variables alone on either runtime, with one container image the
deployment builds from pinned versions", because it gives both runtimes one contract and keeps every
choice about the cloud in the deployment.

> **Variables alone.** Lifecycle work's whole coupling to its environment is environment variables:
> the addresses it is reached at and calls, and secrets, which the deployment populates from its own
> secret store — a Worker's secrets, or the cloud's secret manager for the container. CMOkit reads no
> cloud metadata and imports no cloud SDK. The variables are listed in one reference document, and
> that list is the contract a deployment meets.
>
> **The image.** A deployment that runs the container builds one image from pinned versions of
> `@cmokit/lifecycle` and `@cmokit/cli` and its own configuration. Base images are pinned by digest.
> The build has separate stages for dependencies, tests and runtime; the runtime stage carries no
> build tools and runs as a user without privileges.
>
> **Local and CI.** A `compose.yaml` runs the image as production does, with stand-ins for the payment
> processor, the ledger and the product. A `compose.dev.yaml` overlay holds only what development
> adds, applied explicitly. The Worker runs locally under Wrangler with the same variables, and its
> Durable Objects with it.
>
> **In the product's cloud.** The container runs on a platform that scales to zero, with ingress from
> inside the boundary and from its load balancer only. A merge in the deploying repository builds the
> image and rolls out the service, authenticating by workload identity federation and holding no
> long-lived key.

### Consequences

* Good, because one reference document configures both runtimes, and moving between them changes
  where the variables are set, not what they are.
* Good, because the same image runs locally, in CI and in production, and only variables differ.
* Good, because a deployment builds its image in a pipeline it audits, from versions it pins.
* Bad, because a deployment that runs the container maintains a build of its own rather than pulling
  one artifact.
* Bad, because the variable list is a published contract, and changing its shape is a breaking change.

### Confirmation

CI builds the image, brings up the compose stack and runs the integration tests inside it, and runs
the same tests against the Worker under Wrangler, with no account at any bought tool. A check fails
the build if lifecycle code reads an environment variable the reference document does not list.

## Pros and Cons of the Options

### Environment variables alone on either runtime, with one container image the deployment builds from pinned versions

* Good, because it meets every driver.
* Bad, because it asks a container deployment to build an image.

### A configuration file shipped with the deployment

* Good, because structured configuration is easier to read than many variables.
* Bad, because a Worker has no file system at runtime, so the two runtimes would be configured
  differently, and secrets would still need variables.

### A published CMOkit image that a deployment runs unchanged

* Good, because a deployment pulls one artifact and builds nothing.
* Bad, because the deployment's configuration would then have to arrive at runtime, and the image
  would be built outside the pipeline the product audits.

## More Information

**Reversal cost.** Low: publishing a base image later, which a deployment builds from, changes
nothing a deployment already configures.

## Revisit when

* Lifecycle work needs scheduled work beside the service.
* Deployments ask for a published base image to build from, to avoid installing from npm.
