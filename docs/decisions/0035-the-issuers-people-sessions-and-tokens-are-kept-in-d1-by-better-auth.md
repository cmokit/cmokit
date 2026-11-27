---
status: "proposed"
kind: "requirement-driven"
date: 2026-10-30
decision-makers: [Geoff]
---

# ADR-0035: The issuer's people, sessions and tokens are kept in D1 by Better Auth

**Requirements served:** `HST-05`, `NFR-06`.

## Context and Problem Statement

CMOKit's issuer is built on Better Auth (ADR-0018), which signs people in and issues the tokens a
person's Claude uses to reach CMOKit (`HST-05`). Better Auth keeps people, their ways in, sign-in
sessions, OAuth clients, consents, authorization codes and tokens in one SQL database, through an
adapter. On Workers that database is D1, Cloudflare's SQLite, bound to the issuer as `DB`.

ADR-0006 keeps all of CMOKit's storage on Cloudflare. D1 is billed for rows read and written and for
storage, not while idle. A D1 database is one SQLite database in one location, so every write is seen
at once.

## Decision Drivers

* Scales to zero, on Cloudflare (`NFR-06`).
* No OAuth or account storage of CMOKit's own to write and secure.
* Everything about a person's sign-in in one place, so one person can have many ways in and many
  brands, and erasing a person erases all of it.

## Considered Options

* One D1 database for Better Auth's tables and CMOKit's brand index, through Better Auth's adapter
* Better Auth on a Durable Object's SQLite, through an adapter of CMOKit's own
* Durable Objects of CMOKit's own for people and ways in, beside an OAuth library's KV namespace

## Decision Outcome

Chosen option: "One D1 database for Better Auth's tables and CMOKit's brand index, through Better
Auth's adapter", because it is the store Better Auth supports on Workers, it is Cloudflare's own, and
it scales to zero.

> The issuer keeps people, their ways in, sign-in sessions, OAuth clients, consents, authorization
> codes and tokens in one D1 database, through Better Auth. Tokens and one-time values are kept only
> as SHA-256 hashes, and no provider's token is kept. Beside Better Auth's tables the database holds
> CMOKit's own: each person's brands, the Instagram account each Meta login last shared, the times
> sign-in codes were sent, and the hashed links that add a way in. Every customer's own records stay
> in its Durable Object (ADR-0030). The schema is the one Better Auth migrates to for this
> configuration, and the issuer makes it on first use.

The records from before Better Auth, one Durable Object per person and per way in and the old OAuth
library's grants in the Workers KV namespace `OAUTH_KV`, are copied into the database once, keeping
every person's id, so the brands' records, which name people by id, stay as they are. The copy runs
in the deploy, is safe to repeat, and leaves the old records as they were. Erasing a person erases
their old records too. Nothing writes to the old records.

### Consequences

* Good, because accounts, ways in and the protocol's storage are written and maintained by Better
  Auth's authors.
* Good, because D1 scales to zero, as Durable Objects do, on the same account.
* Good, because a revoked token is refused everywhere at once.
* Good, because a person with many ways in and many brands is a few rows joined by their id.
* Neutral, because the rule that Durable Objects are the only store becomes "Durable Objects for every
  customer's records, D1 for the issuer's".
* Bad, because the old records stay bound to the issuer until they are deleted.

### Confirmation

A test fails if the schema the issuer makes differs from the one Better Auth migrates to for its
configuration. The boundary check fails the build if any package other than the issuer names a KV
namespace, or if anything but the issuer's Worker reads the old one.

## Pros and Cons of the Options

### One D1 database for Better Auth's tables and CMOKit's brand index, through Better Auth's adapter

* Good, because it meets every driver.
* Bad, because the issuer's state is in one location rather than beside each person.

### Better Auth on a Durable Object's SQLite, through an adapter of CMOKit's own

* Good, because Durable Objects would stay the only store.
* Bad, because the adapter would be CMOKit's own code under the most security-critical library it
  uses, and every query would go through one object.

### Durable Objects of CMOKit's own for people and ways in, beside an OAuth library's KV namespace

* Good, because it was already built.
* Bad, because accounts, linking ways in and sessions were CMOKit's own code, which a maintained
  library already does, and a revoked token could be accepted briefly in another location.

## More Information

Sources: the source of Better Auth 1.7.28 and of its `@better-auth/oauth-provider` and
`@better-auth/cimd` plugins, as installed, read on 2026-11-27, and D1's
[pricing](https://developers.cloudflare.com/d1/platform/pricing/) and
[limits](https://developers.cloudflare.com/d1/platform/limits/), to check before launch.

**Follow-on obligations.** The `DB` binding is listed in the deployment reference, beside `OAUTH_KV`
and the old Durable Objects while they remain.

**Reversal cost.** Medium: the tables are Better Auth's, so another store is another of its adapters
and a copy of the rows.

## Revisit when

* The old records have been copied and checked, so their bindings can be deleted.
* The issuer's D1 writes approach the free plan's daily limit.
* Better Auth supports a Durable Object store of its own.
