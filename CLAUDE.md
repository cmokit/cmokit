# CMOkit — Working Agreement

Rules are binding. Each cites the decision record holding its reasoning; read it before proposing a
change. Index: `docs/decisions/README.md`. If a task appears to require breaking a rule, stop and ask.

## Documentation

Every kind of document has one home (ADR-0001). Derivation runs vision → requirements → decision
records → these rules, and citation never runs against it. Documents state what is true now.

## Language and checks

Everything is TypeScript on Node 24 or later, written only in syntax Node can strip, so scripts run
with `node` directly. No second language without a record. `npm run check` type-checks and checks the
decision records and the package boundaries, and `npm test` runs every package's tests with Node's
test runner; CI runs both on every pull request. (ADR-0007)

## Packages

`packages/*` are npm workspaces, each published on its own: `@cmokit/cli` (configuration and the
`cmokit` command), `@cmokit/astro` (the Astro integration), `@cmokit/edge` (the Worker),
`@cmokit/lifecycle` (the lifecycle) and `create-cmokit` (the starter). `@cmokit/edge` never depends
on `@cmokit/lifecycle`.
Each package's source is `src/`, built to `dist/` for publishing. Its exports name `src/` first under
the `cmokit-source` condition, which the repository's type check and tests use, so nothing is built
to be tested; CI builds the starter site against the built packages. (ADR-0011)
A GitHub release stages every package whose version is not yet on npm, by trusted publishing from
`.github/workflows/publish.yml`, and a maintainer approves each staged version under two-factor
authentication; the trusted publisher cannot publish directly. Nothing publishes from a laptop once
a package exists. (ADR-0002)

## Boundaries

- **CMOkit is a dependency, never a site.** No adopter's content, copy or design lives here; the
  starter is the one example site, and it holds only placeholder content. (ADR-0002)
- **Handlers use the web-standard `Request` and `Response` only.** No Cloudflare- or host-specific API
  inside a handler; those belong in the adapters. Edge work runs only as a Worker and keeps no state.
  Lifecycle work runs as a Worker, or as a container that scales to zero inside an audited product's
  boundary, and its handlers are tested on both. An edge handler never imports lifecycle code.
  (ADR-0003)
- **Everything scales to zero.** No part of CMOkit is an always-on server or database. (ADR-0003)
- **Credits are CMOkit's ledger; money is the payment processor's.** Each customer's credit grants,
  usage and balance, in the product's units, are kept in a Durable Object of its own, written against
  a SQL interface and tested on Node's SQLite. All of CMOkit's storage is on Cloudflare, whichever
  runtime runs lifecycle work, and none of it is about money. Every action CMOkit takes on an event
  sets a state, so acting twice is acting once. No package depends on a database client. (ADR-0006,
  ADR-0012)
- **A variant is a page; the edge only chooses.** An experiment's variants are pages of the site, on
  whatever host or CMS it uses, and the experiments are configuration deployed with the edge. The
  edge stores no assignment: the experiments tool decides, the visitor's cookie remembers, and any
  failure serves the control unassigned. Agents always get the control and are never exposed.
  (ADR-0009)
- **The configuration runs experiments.** An experiment's plan and status live in CMOkit's
  configuration, and the deploy makes the experiments tool match; nothing is started or ended in the
  tool by hand. The tool's administrative key is read by the command line alone, never the edge.
  (ADR-0013)
- **One identity.** The edge's visitor cookie is the analytics tool's distinct id, in the edge and the
  browser alike; the browser evaluates no flags and records no exposures. (ADR-0010)
- **No product-specific code.** A product's lifecycle is reached by configured calls to its published
  API, as an OAuth client, and through its identity provider by OpenID Connect or OAuth. Every call
  names the customer it acts on. (ADR-0004)
- **A product sends only usage.** Signed, aggregated usage events, naming user, customer and an
  idempotency key, are the only thing CMOkit accepts from a product. CMOkit debits them from the
  customer's ledger under their key and records them in analytics, and makes the configured calls
  when the balance falls low, is exhausted or is restored. (ADR-0005)
- **Name things for the job, not the vendor.** A bought tool sits behind an interface named for what
  it does: experiments, analytics, messaging, payments. No handler names a tool; only the adapters and
  the Worker that wires them do. (`NFR-03`, ADR-0010, ADR-0012)

## Deployment

- **The environment reaches lifecycle code through variables alone.** No cloud metadata, no cloud SDK,
  no configuration a deployment supplies any other way. Every variable is listed in the deployment
  reference; changing the shape of that list needs a record. (ADR-0008)
- **Images pin their bases by digest and run without privileges.** The local `compose.yaml` is shaped
  like production; development differences go in `compose.dev.yaml` only. (ADR-0008)

## Secrets

Supplied by the deploying environment only. Never committed, logged, or sent to a browser. Never
passed through a model.
