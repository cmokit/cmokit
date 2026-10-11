---
status: "proposed"
kind: "requirement-driven"
date: 2026-10-11
decision-makers: [Geoff]
---

# ADR-0006: CMOkit keeps its state in a Postgres database of its own, on the product's instance

**Requirements served:** `CRD-01`, `CRD-03`, `CRD-06`, `SUB-06`, `NFR-02`, `NFR-04`, `AGT-06`.

## Context and Problem Statement

Under ADR-0005, CMOkit keeps a running credit balance for every entity and must act on each usage
event and each processor event once. That is state, and it can live neither in a bought tool nor in
the payment processor. Everything else CMOkit needs is held elsewhere: subscriptions and money at the
processor, identity in analytics, the entity's own record in the product.

The state is small: grants and debits per entity per usage period, and the keys of events already
acted on. Writes are frequent and must be atomic: a debit and the record of its key succeed together
or not at all.

Only lifecycle work keeps state, and it runs as a container inside the product's audit boundary
(ADR-0003). That boundary already runs a Postgres instance for the product, holding data more
sensitive than CMOkit's, and already backs it up, monitors it and audits it. Lifecycle work scales
out to several containers at once. Its tests run with no account at anything (`NFR-04`), and an
agent must be able to run it locally with none (`AGT-06`).

## Decision Drivers

* Atomic debit with exactly-once acting per key (`CRD-01`, `SUB-06`).
* Shared by every running container of lifecycle work.
* On infrastructure the product already runs, inside its boundary (`NFR-02`).
* CMOkit's credential cannot reach the product's data, even if a grant is wrong.
* Testable and runnable locally with no account (`NFR-04`, `AGT-06`).
* Well known to coding agents, so they configure and query it correctly.

## Considered Options

* Postgres, a database of CMOkit's own on the product's existing instance
* Postgres, a schema of CMOkit's own in the product's database
* Postgres, an instance of CMOkit's own
* Postgres behind a store interface, so other stores can be added
* SQLite
* Redis

## Decision Outcome

Chosen option: "Postgres, a database of CMOkit's own on the product's existing instance", because
it reuses an instance the product already runs and audits, while Postgres itself keeps CMOkit's
credential out of the product's data.

> CMOkit requires Postgres. Its state is entity balances, kept as an append-only list of grants and
> debits, and the keys of events it has acted on; nothing else is stored. It lives in a database of
> CMOkit's own, on the product's existing instance. The deployment supplies a connection string to
> that database. CMOkit's role can connect to that database alone, owns its objects, and has no
> privilege outside it. Only lifecycle work connects, from inside the boundary. Tests and local
> development run the same SQL in-process on PGlite.

### Consequences

* Good, because the product adds a database and a role to an instance it already runs, backs up and
  audits, at no added cost.
* Good, because Postgres cannot query across databases without an extension, so a mistaken grant in
  the product's database does not expose it to CMOkit's role.
* Good, because a uniqueness constraint on the event key makes a replayed event a no-op.
* Good, because tests and local runs use the real SQL, with no account and no server.
* Bad, because a shared instance shares capacity, connection limits and maintenance with the product.
  CMOkit's connection pool size is configuration, so lifecycle work scaling out cannot exhaust the
  instance.
* Bad, because the deployment must revoke the default `PUBLIC` privilege to connect to the product's
  databases, or CMOkit's role could open them.

### Confirmation

Migrations and tests run in CI against PGlite under a role that owns only CMOkit's database, so any
statement that reaches outside it fails the build.

## Pros and Cons of the Options

### Postgres, a database of CMOkit's own on the product's existing instance

* Good, because it meets every driver.
* Bad, because CMOkit's load lands on the product's instance.

### Postgres, a schema of CMOkit's own in the product's database

* Good, because it is one database fewer to name and back up.
* Bad, because only grants separate CMOkit's role from the product's tables. By default every role
  can use the `public` schema and read the catalog of every table's name, and every later change to
  the product's grants has to keep CMOkit out.

### Postgres, an instance of CMOkit's own

* Good, because no grant mistake on the instance can expose the product's data.
* Bad, because the product pays for, runs and audits a second instance for a few small tables.

### Postgres behind a store interface, so other stores can be added

* Good, because a deployment without Postgres could supply another store.
* Bad, because no second store is planned, PGlite already removes the need for a stand-in in tests,
  and the interface would be a published compatibility obligation with one implementation.

### SQLite

* Good, because it is embedded in the container and needs no server.
* Bad, because several containers running at once cannot share one file.

### Redis

* Good, because atomic counters are fast.
* Bad, because a balance is a ledger of grants and debits, which wants transactions and durable
  history rather than counters.

## More Information

**Reversal cost.** Low to move to an instance of CMOkit's own: the connection string changes and
nothing else. Moderate to support a store other than Postgres, which would mean an interface over SQL
written for Postgres.

## Revisit when

* CMOkit needs to store anything beyond balances and event keys.
* CMOkit's load on the shared instance is measurable in the product's own latency.
* A product's boundary runs no Postgres.
