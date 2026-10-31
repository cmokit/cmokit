---
status: "draft"
kind: "requirement-driven"
date: 2026-10-30
decision-makers: [Geoff]
---

# ADR-0035: The issuer's tokens are kept in Workers KV by Cloudflare's OAuth library, and everything else in Durable Objects

**Requirements served:** `HST-05`, `NFR-06`.

## Context and Problem Statement

CMOkit's issuer is built on Cloudflare's OAuth library (ADR-0018), which issues the tokens a person's
Claude uses to reach CMOkit (`HST-05`). The library keeps its grants, authorization codes and tokens
in a Workers KV namespace bound as `OAUTH_KV`: tokens, codes and client secrets only as SHA-256
hashes, and each grant's properties encrypted with AES-GCM.

CLAUDE.md says the edge's and the lifecycle's only store is Durable Objects, and ADR-0006 keeps all of
CMOkit's storage on Cloudflare. Workers KV is Cloudflare's own and is billed for reads, writes and
storage, not while idle: the free plan allows 100,000 reads, 1,000 writes and 1 GB a day, and the
paid plan includes 10 million reads and 1 million writes a month. Its changes reach every location
eventually, not at once.

## Decision Drivers

* Scales to zero, on Cloudflare (`NFR-06`).
* No OAuth storage of CMOkit's own to write and secure.
* Everything CMOkit's own code keeps stays in Durable Objects.

## Considered Options

* Workers KV for the library's tokens alone, through the library; Durable Objects for everything else
* A Durable Object store for the library, replacing its KV storage
* An authorization server of CMOkit's own, written on Durable Objects

## Decision Outcome

Chosen option: "Workers KV for the library's tokens alone, through the library; Durable Objects for
everything else", because it keeps the store the library was built and tested on, and the store is
Cloudflare's own and scales to zero.

> The issuer's OAuth grants, authorization codes and tokens are kept by Cloudflare's OAuth library,
> in Workers KV. Nothing else of CMOkit's is kept in KV: accounts, sign-in identities, email codes
> and every customer's records are in Durable Objects (ADR-0030). No code of CMOkit's reads or writes
> the library's namespace.

### Consequences

* Good, because the protocol's storage is written and maintained by the library's authors.
* Good, because KV scales to zero, as Durable Objects do, on the same account.
* Bad, because a token revoked in one location can still be accepted briefly in another until the
  change reaches it, so tokens are kept short-lived.
* Neutral, because the rule that Durable Objects are the only store becomes "Durable Objects for
  everything CMOkit's own code keeps".

### Confirmation

The boundary check fails the build if any package other than the issuer binds a KV namespace, and
review checks that the issuer's own code never touches `OAUTH_KV`.

## Pros and Cons of the Options

### Workers KV for the library's tokens alone, through the library; Durable Objects for everything else

* Good, because it meets every driver.
* Bad, because there are two kinds of store to know about, and one of them is eventually consistent.

### A Durable Object store for the library, replacing its KV storage

* Good, because Durable Objects would stay the only store, and a revocation would apply everywhere at
  once.
* Bad, because the library documents no way to replace its storage, so this is a fork of
  security-critical code to keep in step with every release.

### An authorization server of CMOkit's own, written on Durable Objects

* Good, because CMOkit would control every byte.
* Bad, because it is the most security-critical code there is, and a maintained library already does
  it.

## More Information

Sources: Cloudflare's [workers-oauth-provider](https://github.com/cloudflare/workers-oauth-provider)
and its [storage schema](https://github.com/cloudflare/workers-oauth-provider/blob/main/storage-schema.md),
and [Workers KV pricing](https://developers.cloudflare.com/kv/platform/pricing/), read through search
extracts on 2026-10-30. How long a KV change takes to reach every location was not confirmed from
Cloudflare's documentation.

**Follow-on obligations.** CLAUDE.md's rule that Durable Objects are the only store gains this
exception once the record is accepted. The `OAUTH_KV` binding is listed in the deployment reference.

**Reversal cost.** Low: the library owns the namespace, so a later store is the library's change or a
move of short-lived tokens.

## Revisit when

* The library lets its storage be replaced by a Durable Object.
* A revoked token is accepted after revocation long enough to matter.
* The issuer's KV writes approach the free plan's daily limit.
