---
status: "proposed"
kind: "requirement-driven"
date: 2026-11-27
decision-makers: [Geoff]
---

# ADR-0054: An Instagram account a person connects to their brand becomes a way into their account

**Requirements served:** `HST-02`, `HST-10`, `CUS-03`.

## Context and Problem Statement

A person's account is a person record in the issuer, and each way they sign in is an identity that
points at one person (ADR-0018, ADR-0030). An identity is claimed by whichever person first signs in
with it, and is never joined to another by itself, so ADR-0048 accepted that a person who signs in
with Instagram and with GitHub has two accounts. A brand's users, its activation and its accepted
terms are kept for a person (ADR-0017, ADR-0047), so the second account has none of them.

That is what happens to a creator who signs in one way, then connects their brand's Instagram on the
account page, then signs in with that Instagram account: they land on an empty account that is not
activated and has accepted no terms for any brand, though connecting proved, through the same Meta
app, that they hold that Instagram account. CMOKit's own operator hit this on its own brand.

## Decision Drivers

* A person is one account, whichever way they sign in, once they have proved each way is theirs.
* An account is never joined to another by an address or a handle alone (ADR-0018).
* Nobody loses a brand, or anything a brand holds, to a link.
* No step the person has to know to take, and nothing kept beyond what sign-in already keeps
  (`HST-10`).

## Considered Options

* Link the Instagram account at the moment a person connects it to their brand
* A "link another sign-in" step on the account page
* Keep two accounts, as ADR-0048 has it

## Decision Outcome

Chosen option: "Link the Instagram account at the moment a person connects it to their brand",
because connecting already proves the person holds the account, through the same Meta app and the
same Instagram account ID the Instagram sign-in names, and they take no extra step.

> When a person connects a brand's Instagram account on the account page, the content server asks
> the issuer to make that account's sign-in identity theirs. An identity nobody has signed in with
> becomes theirs. One that has signed in to an account with no brands has that empty account deleted
> first, which signs it out, and then becomes theirs. One that signs in to an account with brands is
> left as it is: two accounts that each hold brands are never merged by this. From then on, signing
> in with that Instagram account reaches the person who connected it, with their brands, their
> activation and their accepted terms. The person's record keeps the account's ID and handle, as an
> Instagram sign-in does (ADR-0048).

This replaces ADR-0048's consequence that a person who signs in with Instagram and with GitHub has
two accounts, for an Instagram account the person connected to their brand.

### Consequences

* Good, because a creator who connects their Instagram signs in with it to the account they made.
* Good, because the link rests on the proof Meta already gave, not on a matching address or handle.
* Bad, because anyone Meta lets sign in with that Instagram account, such as a second person with a
  role on it in the business portfolio, reaches the account of the person who connected it, as they
  already reach whoever signed in with it first.
* Neutral, because a person who signed in with Instagram before this was built, and whose empty
  account holds the identity, connects the brand's Instagram again to link it.
* Neutral, because two accounts that each hold brands stay two accounts.

### Confirmation

Tests of the issuer assert that connecting links an identity nobody has signed in with, replaces an
empty account and signs it out, leaves an account with brands alone, and is safe to repeat. A test of
the content server asserts that the Instagram callback asks for the link for the person who
connected, with the account Meta shared.

## Pros and Cons of the Options

### Link the Instagram account at the moment a person connects it to their brand

* Good, because it meets every driver.
* Bad, because only Instagram is linked this way; another provider needs its own proof.

### A "link another sign-in" step on the account page

The general answer: a signed-in person signs in a second way, and that identity is joined to them.

* Good, because it works for every provider.
* Bad, because the person has to know the step exists, which the operator who hit this did not, and
  it adds a sign-in flow that is open to taking over an account by linking (ADR-0018).

### Keep two accounts, as ADR-0048 has it

* Good, because nothing changes.
* Bad, because a creator's Instagram sign-in lands on an empty, unactivated account with no terms,
  and the waitlist page tells them to join the waitlist they are already through.

## More Information

Narrows ADR-0048's two-accounts consequence, and keeps ADR-0018's rule that no address joins two
accounts. Uses ADR-0053's deletion for the empty account.

**Follow-on obligations.** None beyond the issuer call the content server makes.

**Reversal cost.** Low: one issuer call and one line in the Instagram callback. Identities already
linked stay linked.

## Revisit when

* A person asks to link a provider other than Instagram, which calls for the account page's linking
  step.
* Meta lets an Instagram sign-in and a brand connection return different account IDs.
