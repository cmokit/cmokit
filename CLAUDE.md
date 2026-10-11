# CMOkit — Working Agreement

Rules are binding. Each cites the decision record holding its reasoning; read it before proposing a
change. Index: `docs/decisions/README.md`. If a task appears to require breaking a rule, stop and ask.

## Documentation

Every kind of document has one home (ADR-0001). Derivation runs vision → requirements → decision
records → these rules, and citation never runs against it. Documents state what is true now.

## Boundaries

- **CMOkit is a dependency, never a site.** No adopter's content, copy or design lives here; the
  starter is the one example site, and it holds only placeholder content. (ADR-0002)
- **Handlers use the web-standard `Request` and `Response` only.** No Cloudflare- or host-specific API
  inside a handler; those belong in the adapters. Handlers keep no state of their own. (ADR-0003)
- **No product-specific code.** A product is reached by configured calls to its published API, as an
  OAuth client, and through its identity provider by OpenID Connect. CMOkit accepts no events from a
  product. (ADR-0004)
- **Name things for the job, not the vendor.** A bought tool sits behind an interface named for what
  it does: experiments, analytics, messaging, payments. (`NFR-03`)

## Secrets

Supplied by the deploying environment only. Never committed, logged, or sent to a browser. Never
passed through a model.
