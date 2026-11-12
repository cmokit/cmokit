---
status: "proposed"
kind: "requirement-driven"
date: 2026-11-12
decision-makers: [Geoff]
---

# ADR-0047: Beta terms are accepted with a box on the sign-in screen, and kept with the customer

**Requirements served:** `HST-15`, `HST-03`, `HST-10`, `HST-11`, `HST-13`.

## Context and Problem Statement

ADR-0039 had each user accept the beta terms on a one-time page that account_status links to, after
their Claude had connected. In the onboarding flow that design produced, a creator signs in, names
their brand, adds CMOkit to Claude Desktop, signs in again from Claude, and only then meets a
second page to accept the terms before anything works. That is one more stop than the flow needs,
at the point where a new user is most likely to give up. The person already looks at one screen of
CMOkit's own before anything else happens: the issuer's sign-in screen. Something has to say
whether acceptance can happen there, without the issuer keeping a record no customer's export
carries, which is why ADR-0039 turned that option down.

## Decision Drivers

* Acceptance is the person's own act, not something a model says on their behalf.
* No extra stop in the onboarding flow (`HST-03`).
* It is kept per customer, apart from every other's (`HST-10`), and leaves with its export
  (`HST-13`).
* A self-hosted server asks for no terms unless its operator sets some (`HST-11`).
* The issuer keeps no record of its own about acceptance.

## Considered Options

* A box on the sign-in screen, with the version carried in the grant and recorded by the content
  server
* Keep the one-time page of ADR-0039 alone
* A box on the sign-in screen, with acceptance kept by the issuer

## Decision Outcome

Chosen option: "A box on the sign-in screen, with the version carried in the grant and recorded by
the content server", because the person ticks it on a screen they see anyway, and the record still
lives with the customer.

> The issuer takes the same two variables as the content server, `TERMS_URL` and `TERMS_VERSION`,
> and asks for nothing when either is unset. With both set, the sign-in screen has a box, which must
> be ticked to use any way in, linking to the terms and naming their version. The issuer
> stores nothing about it: the grant it issues carries the version accepted, alongside the person
> and their customer. At a person's first call with that grant, the content server records the
> person, the version and the time in the customer's Durable Object, as ADR-0039's page did, and the
> record is in the customer's export. The screen cannot know who is signing in until they have
> chosen a way in, so the box shows at every sign-in, not only the first. ADR-0039's one-time page
> stays, for a connection made before the box existed or a grant carrying an older version: such a
> user is still offered account_status alone until they accept there, or sign in again and tick the
> box.

### Consequences

* Good, because acceptance takes no stop of its own in the onboarding flow.
* Good, because the record is where ADR-0039 put it, so exports and the one-time page need no
  change.
* Bad, because a person who has accepted ticks the box again at each sign-in.
* Bad, because the issuer now reads the terms variables, so both Workers must be deployed with the
  same values.
* Neutral, because a person who is a user of two customers is still recorded once for each.

### Confirmation

A test of the issuer asserts that, with the variables set, signing in without the box ticked is
refused and sends no code, that ticking it puts the version in the grant, and that
without the variables there is no box. A test of the content server asserts that a grant carrying
the current version is recorded at the first call and appears in the export, and that a grant
carrying an older version is still asked to accept.

## Pros and Cons of the Options

### A box on the sign-in screen, with the version carried in the grant and recorded by the content server

* Good, because it meets every driver.
* Bad, because the box shows at every sign-in.

### Keep the one-time page of ADR-0039 alone

* Good, because nothing changes.
* Bad, because acceptance stays a stop of its own, after setup in Claude, where a new user meets it
  last.

### A box on the sign-in screen, with acceptance kept by the issuer

* Good, because a person who has accepted would not see the box again.
* Bad, because the issuer serves every product on the server, and it would keep a record about a
  person that no customer's export carries.

## More Information

Supersedes ADR-0039, whose one-time page this record keeps as a fallback.

**Follow-on obligations.** The deployment reference names the variables for both Workers, and the
hosted deploy passes them to both.

**Reversal cost.** Low: the box is one field on the sign-in screen and one property of the grant.

## Revisit when

* The closed beta ends, and the terms become the service's ordinary terms of use.
* Ticking the box at every sign-in becomes a complaint.
