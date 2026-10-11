---
status: "proposed"
kind: "requirement-driven"
date: 2026-10-11
decision-makers: [Geoff]
---

# ADR-0004: A product's lifecycle is reached by calling its API, not by events it sends

**Requirements served:** `SUB-04`, `ENT-02`, `ENT-03`, `CRD-03`, `PRD-01`, `PRD-02`, `PRD-03`, `PRD-04`.

## Context and Problem Statement

A subscription's lifecycle changes what an entity's members may do in the product: a new entity is
let in with the person who paid as its first member, a lapsed one is paused, one whose credits have
run out is suspended, a returning one is resumed. CMOkit and the product have to exchange those
facts, and someone has to decide which side starts each exchange.

The events that drive the lifecycle start at the payment processor, which sends them to CMOkit
signed and retried, or at CMOkit itself when an entity's credits run out. What CMOkit needs from the
product is mostly an action (let in, pause, suspend, resume) and occasionally a current fact (does
this entity still exist before renewal). Products differ in everything else, and CMOkit must contain
no code specific to one (`PRD-02`).

Usage is a different exchange: only the product sees it, so it starts there. It is decided in
ADR-0005, and this record covers the lifecycle alone.

## Decision Drivers

* No code specific to one product in CMOkit (`PRD-02`).
* A product needs nothing new to be reached beyond a published API and a standard identity provider.
* An unreachable product delays an action and loses nothing (`PRD-04`).
* CMOkit holds only the privileges its calls need (`PRD-03`).

## Considered Options

* CMOkit calls the product's API, configured per lifecycle event
* The product sends CMOkit events by webhook
* A shared queue both sides read and write

## Decision Outcome

Chosen option: "CMOkit calls the product's API, configured per lifecycle event", because the events
already arrive at CMOkit from the processor, and calling out needs nothing of a product but its API.

> CMOkit signs a new member in through the product's identity provider by OpenID Connect, or
> authorizes their agent client by OAuth, and authenticates to the product's API as an OAuth client.
> For each lifecycle event, configuration names the call to make, and every call names the entity it
> acts on. The product sends CMOkit no lifecycle event. A call that fails is retried from the retry of
> the event that caused it, and is safe to repeat.

### Consequences

* Good, because a product needs only a published API and a standard identity provider.
* Good, because the processor's retries carry CMOkit's, so CMOkit keeps no queue.
* Bad, because a fact the product knows first, such as an entity deleting its account, reaches
  CMOkit only when CMOkit next asks. CMOkit asks before each renewal.
* Bad, because a call the product refuses for good, after the processor stops retrying, needs a
  person, so it is alerted.

### Confirmation

Tests drive each lifecycle event against a replay of the processor and a stand-in product, assert the
configured call, and repeat it to show acting twice has the effect of acting once.

## Pros and Cons of the Options

### CMOkit calls the product's API, configured per lifecycle event

* Good, because it meets every driver.
* Bad, because CMOkit learns of changes in the product only when it asks.

### The product sends CMOkit events by webhook

* Good, because a change in the product reaches CMOkit at once.
* Bad, because every product must build signing, retries and delivery to CMOkit for lifecycle facts
  CMOkit mostly already has. (Usage, which CMOkit cannot have otherwise, is sent this way; see
  ADR-0005.)
* Bad, because the lifecycle's events start at the processor, not the product, so the product would
  mostly relay what CMOkit already knows.

### A shared queue both sides read and write

* Good, because it decouples the two sides' availability.
* Bad, because it is infrastructure both sides must run and secure, for a few events a day per
  customer.

## More Information

**Reversal cost.** Low: ADR-0005's inbound endpoint for usage could carry lifecycle events too, and
nothing already configured would change.

## Revisit when

* A product's own events need to reach messaging quickly, such as a milestone that should trigger a
  nurture step, and asking on a schedule is too slow.
