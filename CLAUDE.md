# CMOkit — Working Agreement

Rules are binding. Each cites the decision record holding its reasoning; read it before proposing a
change. Index: `docs/decisions/README.md`. If a task appears to require breaking a rule, stop and ask.

## Documentation

Every kind of document has one home (ADR-0001). Derivation runs vision → requirements → decision
records → these rules, and citation never runs against it. Documents state what is true now.

## Language and checks

Everything is TypeScript on Node 24 or later, written only in syntax Node can strip, so scripts run
with `node` directly. No second language without a record. `npm run check` type-checks and checks the
decision records; CI runs it on every pull request. (ADR-0007)

## Packages

`packages/*` are npm workspaces, each published on its own: `@cmokit/cli` (configuration and the
`cmokit` command), `@cmokit/astro` (the Astro integration), `@cmokit/edge` (the Worker),
`@cmokit/lifecycle` (the container) and `create-cmokit` (the starter). `@cmokit/edge` never depends
on `@cmokit/lifecycle`.
A GitHub release publishes every package whose version is not yet on npm, by trusted publishing from
`.github/workflows/publish.yml`; nothing publishes from a laptop once a package exists. (ADR-0002)

## Boundaries

- **CMOkit is a dependency, never a site.** No adopter's content, copy or design lives here; the
  starter is the one example site, and it holds only placeholder content. (ADR-0002)
- **Handlers use the web-standard `Request` and `Response` only.** No Cloudflare- or host-specific API
  inside a handler; those belong in the adapters. Edge work runs only as a Worker and keeps no state;
  lifecycle work runs only as a container, inside the product's audit boundary. An edge handler never imports lifecycle code or the
  database client. (ADR-0003)
- **State is a Postgres database of CMOkit's own, and is only balances and event keys.** The database
  sits on the product's existing instance; CMOkit's role reaches that database alone and owns
  nothing outside it.
  Balances are append-only grants and debits; each event is acted on once, by its key. Tests run the
  same SQL on PGlite. (ADR-0006)
- **No product-specific code.** A product's lifecycle is reached by configured calls to its published
  API, as an OAuth client, and through its identity provider by OpenID Connect or OAuth. Every call
  names the entity it acts on. (ADR-0004)
- **A product sends only usage.** Signed, rolled-up usage events, naming member, entity and an
  idempotency key, are the only thing CMOkit accepts from a product. CMOkit decides when an entity's
  credits run out and makes the configured suspend call. (ADR-0005)
- **Name things for the job, not the vendor.** A bought tool sits behind an interface named for what
  it does: experiments, analytics, messaging, payments. (`NFR-03`)

## Deployment

- **One lifecycle image, explicit entrypoints.** The service is the default command; `cmokit migrate`
  runs from the same image. Migrations never run at startup. (ADR-0008)
- **The environment reaches lifecycle code through variables alone.** No cloud metadata, no cloud SDK,
  no configuration a deployment supplies any other way. Every variable is listed in the deployment
  reference; changing the shape of that list needs a record. (ADR-0008)
- **Images pin their bases by digest and run without privileges.** The local `compose.yaml` is shaped
  like production; development differences go in `compose.dev.yaml` only. (ADR-0008)

## Secrets

Supplied by the deploying environment only. Never committed, logged, or sent to a browser. Never
passed through a model.
