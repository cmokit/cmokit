---
status: "proposed"
kind: "requirement-driven"
date: 2026-11-25
decision-makers: [Geoff]
---

# ADR-0053: A person deletes their account on the account page, which erases their brands and their sign-in

**Requirements served:** `HST-13`, `HST-10`.

## Context and Problem Statement

A customer can export everything CMOKit holds for it and close its account, which deletes what
CMOKit holds (`HST-13`). Export is on the account page (ADR-0041); closing is not anywhere, and the
customer's object has a whole-erase that nothing calls (ADR-0030).

What CMOKit holds for one person is spread over several records. Each brand they run is a customer's
object with its brand context, pieces, results, waitlist, visit counts and sealed credentials
(ADR-0030, ADR-0043, ADR-0050). The issuer holds, in D1 through Better Auth, the person, their ways
in, proven address, sessions, their brands' index, and the consents and tokens issued to them, and
still holds the records from before Better Auth that were copied from (ADR-0035). CMOKit's own brand's waitlist holds
their entry, which lets them in again at their next sign-in while it stays activated (ADR-0043,
ADR-0048). During the beta a brand has one user, the person who made it, though users are kept as a
list (ADR-0030).

## Decision Drivers

* A person deletes everything CMOKit holds for them themselves, with no request to anyone.
* Nothing is deleted by one tap, or by a request from another site.
* A delete cut short can be finished by deleting again.
* Another user's records are never deleted with this person's.
* CMOKit's own brand, whose waitlist lets everyone in, is not deleted by the account that runs it.

## Considered Options

* A delete on the account page, confirmed by typing a word, that erases the person's brands, their
  entry on CMOKit's waitlist, and their sign-in records and grants
* A delete per brand, leaving the person's sign-in for them to delete separately
* A request by email that a maintainer carries out

## Decision Outcome

Chosen option: "A delete on the account page, confirmed by typing a word", because it is whole, the
person does it themselves, and it reuses the account page's existing guard on changes.

> The account page's Account tab, and its pages for a person with no brand yet, offer **Delete your
> account**: it says what goes and that it cannot be undone, and posts only with the word `delete`
> typed, from the account page's own origin like every other change (ADR-0041).
>
> Deleting runs in order, each step safe to repeat: each brand in the person's index is **left**,
> which erases the whole customer's object when they are its only user, and otherwise removes only
> their user, terms, Claude and pending-link rows; their entry on CMOKit's own waitlist is deleted,
> by their proven address and by the Instagram account they signed in with; then the issuer erases
> the person's tokens, consents, sessions, ways in, brands' index, the Instagram account they last
> shared and the person themselves, and erases their records from before Better Auth. The session cookie is cleared, and the page says
> the account is deleted.
>
> A user of the brand named as CMOKit's own waitlist is refused, and is offered no delete.
>
> **Outside CMOKit**, and so not deleted: what Meta keeps of a connected Instagram account and its
> listing of CMOKit's app, which the person removes in Instagram; the person's entries on other
> brands' waitlists, which are those brands' records; and what the sending service, the event
> platform, Cloudflare's logs and the person's Claude conversations keep, under their own terms.

### Consequences

* Good, because a person can delete everything CMOKit holds for them without asking anyone.
* Good, because each step is safe to repeat, so a failure part way is finished by trying again.
* Bad, because there is no grace period: a delete is final the moment it runs.
* Bad, because once brands are paid for, deleting will also have to end the subscription, which
  this does not yet do.

### Confirmation

Tests on Node's SQLite assert that leaving a brand as its only user leaves every table empty, that
leaving one with another user keeps theirs, that the waitlist forgets the person by address and by
Instagram account, that the account page deletes only with the word typed and from its own origin,
and that after the issuer's delete the person's identities, records and tokens are gone.

## Pros and Cons of the Options

### A delete on the account page, confirmed by typing a word

* Good, because it meets every driver.
* Bad, because typing a word is a small extra step on a phone.

### A delete per brand, leaving the person's sign-in for them to delete separately

* Good, because a person with several brands can drop one and keep the rest.
* Bad, because deleting everything takes several steps, and the sign-in left behind still holds
  their address and lets them in again by CMOKit's waitlist.

### A request by email that a maintainer carries out

* Good, because nothing is built.
* Bad, because CMOKit sends and reads no email yet, and a person's data waits on someone else.

## More Information

The issuer deletes each of Better Auth's tables' rows for the person by their id, since D1 is not
relied on to cascade; a test asserts that a deleted person's token and refresh token stop working.

**Reversal cost.** Low: the delete is one route, one call per record, and one issuer call.

## Revisit when

* Brands are paid for, so deleting must end the subscription first.
* A brand has more than one user, so a user may need to leave a brand without deleting their account.
* A person asks to delete one brand and keep the others.
