---
status: "proposed"
kind: "requirement-driven"
date: 2026-11-11
decision-makers: [Geoff]
---

# ADR-0044: A brand's people move through one funnel, and the waitlist is its first stage

**Requirements served:** `LEAD-04`, `CUS-03`, `SUB-01`, `HST-12`.

## Context and Problem Statement

CMOkit lets people in through a closed beta: they join a brand's waitlist, move up it, and a user of
the brand activates them (`LEAD-04`, ADR-0043). A public beta will let people sign up without being
activated, and a paid launch will add subscribing (`SUB-01`, `HST-12`). Each brand runs the same
steps for its own audience (`CUS-03`).

Built one at a time, these would be three systems with three records of the same person: a waitlist
entry, a sign-up, and a subscriber. A brand could then not see one person's way from joining to
paying, and each new step would repeat what joining already does: the referral code, where the
person came from, and their place.

## Decision Drivers

* One record of each person a brand's funnel reaches, from their first join onward.
* The public beta and subscribing are added without moving anyone or anything already kept.
* Nothing is built before the stage that needs it.

## Considered Options

* One funnel for each brand, kept in the brand's waitlist records, with each later step a stage of it
* A general funnel engine now, with stages a brand configures
* A separate system for each step: waitlist, sign-up, subscription

## Decision Outcome

Chosen option: "One funnel for each brand, kept in the brand's waitlist records, with each later step
a stage of it", because it keeps one record of each person and builds nothing early.

> A brand's funnel is the people in its waitlist records, each in one stage: joined, then boosted by
> referrals and connected Instagram (ADR-0045), then activated. Where a person came from, their
> referral code and their place are kept from their first join and serve every stage after it. The
> public beta's sign-up is the same join with activation made automatic, a brand setting added when
> it is built. Subscribing is the lifecycle's checkout (ADR-0017) after activation, and the
> subscription is kept by the lifecycle, not in the funnel records. A new step is a new stage of
> this funnel, never a new list.

### Consequences

* Good, because a brand sees each person's way from the page that brought them to activation, and
  later to paying.
* Good, because the public beta needs one setting, not a second list.
* Bad, because the records keep the name waitlist after people can sign up without waiting; a
  rename is cheap and can come with the public beta.

### Confirmation

Review: a pull request that adds a sign-up or subscription step adds a stage to the brand's waitlist
records or to the lifecycle, not a new list of people.

## Pros and Cons of the Options

### One funnel for each brand, kept in the brand's waitlist records, with each later step a stage of it

* Good, because it meets every driver.
* Bad, because the stages are fixed in code, so a brand cannot add its own; no brand has asked to.

### A general funnel engine now, with stages a brand configures

* Good, because any brand could shape its own funnel.
* Bad, because it builds stages nobody uses yet, which the third driver rules out.

### A separate system for each step: waitlist, sign-up, subscription

* Good, because each step could be built without touching the others.
* Bad, because it keeps three records of one person, which the first driver rules out.

## More Information

**Follow-on obligations.** The automatic-activation setting, with the public beta. Renaming the
records from waitlist, if the name misleads by then.

**Reversal cost.** Low: nothing is built yet beyond the waitlist itself.

## Revisit when

* A brand needs a stage that is neither before activation nor the lifecycle's subscription.
* A brand asks to shape its own funnel.
