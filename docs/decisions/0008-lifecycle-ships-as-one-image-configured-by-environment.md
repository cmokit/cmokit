---
status: "proposed"
kind: "requirement-driven"
date: 2026-10-11
decision-makers: [Geoff]
---

# ADR-0008: Lifecycle work ships as one image, coupled to its environment by variables alone

**Requirements served:** `NFR-01`, `NFR-02`, `NFR-04`, `NFR-05`, `AGT-06`, `CRD-01`, `SUB-06`.

## Context and Problem Statement

Lifecycle work runs as a container inside the product's audit boundary (ADR-0003), with its state in
a Postgres database of its own on the product's instance (ADR-0006). It has two things to run: the
service that receives the payment processor's and the product's events and calls the product, and
the migration that creates and updates its database. The product deploys it beside its own services,
in a pipeline the product already runs and audits.

Something has to decide what is deployed, how a deployment configures it, how its database is
migrated, and how a contributor or an agent runs the same thing locally with no account
(`NFR-04`, `AGT-06`).

## Decision Drivers

* The service and its migration can never run different versions of CMOkit against each other.
* A migration happens because someone ran it, never as a side effect of a container starting.
* Nothing in the image chooses a cloud; the product's boundary supplies everything (`NFR-02`).
* Secrets reach the container from the environment and nowhere else (`NFR-05`).
* What runs locally and in CI is shaped like what runs in production.
* An upgrade is a version change (`NFR-01`).

## Considered Options

* One image, with the service and the migration as entrypoints, coupled to its environment by
  environment variables alone, and a production-shaped compose stack
* A separate image for the service and for the migration
* Migrating at container start
* A published CMOkit image that a deployment runs unchanged

## Decision Outcome

Chosen option: "One image, with the service and the migration as entrypoints, coupled to its
environment by environment variables alone, and a production-shaped compose stack", because it rules
out version skew between the service and its migration, and keeps every choice about the cloud in
the deployment.

> **One image, explicit entrypoints.** The deployment builds one image from pinned versions of
> `@cmokit/lifecycle` and `@cmokit/cli` and its own configuration. The image's default command
> serves; `cmokit migrate`, run from the same image, migrates. Migrations run only when a person or
> the deploy runs them, before a new revision of the service rolls out, and never at startup.
>
> **Variables alone.** The image's whole coupling to its environment is environment variables: the
> database connection, the addresses it is reached at, and secrets, which the deployment populates
> from its own secret store. CMOkit reads no cloud metadata and imports no cloud SDK. The variable
> surface is listed in one reference document, and it is the contract a deployment meets.
>
> **The image.** Base images are pinned by digest. The build has separate stages for dependencies,
> tests and runtime; the runtime stage carries no build tools and runs as a user without privileges.
>
> **Local and CI.** A `compose.yaml` runs the image as production does, with Postgres and stand-ins
> for the payment processor and the product, publishing no database port. A `compose.dev.yaml`
> overlay holds only what development adds, applied explicitly. Integration tests run in a test
> stage of the same image, inside the compose network.
>
> **In the product's cloud.** On a cloud with a container service, the service runs with ingress
> from inside the boundary and from its load balancer only, and the migration runs as a one-off job
> from the same image. A merge in the deploying repository builds the image, runs the migration and
> rolls out the service, authenticating by workload identity federation and holding no long-lived
> key.

### Consequences

* Good, because the service and the migration are the same build, so they cannot disagree about the
  schema.
* Good, because a failed migration stops a deploy before the new service starts, rather than
  crash-looping it.
* Good, because the same image runs locally, in CI and in production, and only variables differ.
* Good, because the deployment builds the image in a pipeline it audits, from versions it pins.
* Bad, because every deployment maintains a build of its own rather than pulling one artifact.
* Bad, because the variable surface is a published contract, and changing its shape is a breaking
  change.

### Confirmation

CI builds the image, brings up the compose stack, runs the migration from the image and the
integration tests inside the network, with no account at any bought tool. A check fails the build if
lifecycle code reads an environment variable the reference document does not list.

## Pros and Cons of the Options

### One image, with the service and the migration as entrypoints, coupled to its environment by environment variables alone, and a production-shaped compose stack

* Good, because it meets every driver.
* Bad, because it asks the deployment to build an image.

### A separate image for the service and for the migration

* Good, because each image carries only what its job needs.
* Bad, because a deploy can run one version's migration against another version's service, and the
  failure shows up as wrong data rather than a failed deploy.

### Migrating at container start

* Good, because no deploy step is needed to migrate.
* Bad, because every new instance races to migrate, a failed migration crash-loops the service, and
  a migration happens whenever the platform starts a container rather than when someone chose to.

### A published CMOkit image that a deployment runs unchanged

* Good, because a deployment pulls one artifact and builds nothing.
* Bad, because the deployment's configuration would then have to arrive at runtime, and the image
  would be built outside the pipeline the product audits.

## More Information

**Reversal cost.** Low: publishing a base image later, which a deployment builds from, changes
nothing a deployment already configures.

## Revisit when

* Lifecycle work needs a long-running worker or scheduled work beside the service.
* Deployments ask for a published base image to build from, to avoid installing from npm.
