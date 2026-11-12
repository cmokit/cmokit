---
status: "proposed"
kind: "requirement-driven"
date: 2026-11-12
decision-makers: [Geoff]
---

# ADR-0048: Creators sign in with Instagram, and CMOkit's waitlist lets them in by the handle they proved

**Requirements served:** `HST-02`, `HST-01`, `HST-03`, `HST-10`, `CUS-03`, `LEAD-04`.

## Context and Problem Statement

Hosted CMOkit's users are professional creators, who arrive from the Instagram app with a business or
creator account. ADR-0018 offers them an email code, Google, GitHub or Facebook, and turned down
Instagram because its login grants business permissions beyond identity. In production only GitHub is
on, which creators mostly do not have, and email codes wait for SendGrid. Activation is decided by
the email address a person proved (ADR-0018), while CMOkit's waitlist already proves each person's
Instagram handle by the referral code they comment on one of CMOkit's Reels (ADR-0045). Something
has to say how a creator signs in with the account they use every day, and how a sign-in that
proves no email address is matched to a person activated on the waitlist.

Meta does not offer Instagram Login to new apps; CMOkit's app has API setup with Unified login, built
on Facebook Login for Business (ADR-0045). Its login is shaped by a configuration made in the app,
not by a list of scopes, and comes back to a redirect address the app allows, which Meta sets for
the whole app rather than for each configuration.

## Decision Drivers

* A creator signs in with their Instagram account, on a phone, with nothing else to set up.
* A person is let in only for a handle proven to be theirs, and only once a user of CMOkit's own
  brand has activated them (`CUS-03`, ADR-0043).
* Handles change; the account a person signs in with does not.
* CMOkit keeps no token it does not need, and no record about a person outside their customer's
  export beyond what sign-in already keeps (`HST-10`).
* GitHub, and a connection already made with it, keep working.

## Considered Options

* Instagram through a Unified Login configuration of the sign-in's own, with activation by the
  proved handle, kept by the Instagram account's ID
* Keep Facebook Login and email codes only, as ADR-0018 has it
* A handle typed at sign-in, matched against the waitlist

## Decision Outcome

Chosen option: "Instagram through a Unified Login configuration of the sign-in's own, with
activation by the proved handle, kept by the Instagram account's ID", because it is the only option
that signs a creator in with the account the waitlist already proved.

> The issuer offers Instagram when it has the Meta app's ID and secret and the ID of a Facebook Login
> for Business configuration made for sign-in, apart from the brand connection's, and the app allows
> the issuer's own callback as a redirect beside the account page's. Instagram
> is the sign-in screen's first and primary button, and the other ways in follow as plain buttons.
> The issuer trades the code for a token, reads the Instagram account the person shared, by its ID
> and handle, and keeps the token nowhere. The identity is named by the account's ID, so a person who
> changes their handle is the same person; their person record keeps the handle they last signed in
> with. Instagram proves no email address. At a person's first call, the content server lets them in
> when a user of the brand `WAITLIST_CUSTOMER` names activated a person on its waitlist whose proved
> handle is the one they signed in with. The first Instagram account to sign in with that handle is
> written on that person's waitlist record, and from then on that record lets in that account alone,
> whatever its handle. Google is not offered in Instagram's or Facebook's in-app browser, where it
> refuses to sign anyone in. Until Meta's App Review passes, only people with a role on the Meta app
> can sign in with Instagram, so each beta creator is added as a tester.

This replaces ADR-0018's rule that every sign-in grants nothing beyond identity, for Instagram alone:
what Meta grants is the configuration's to say, and CMOkit uses it for that one read.

### Consequences

* Good, because a creator signs in with the account they use every day, and the waitlist's proof is
  what lets them in.
* Good, because a handle given up and taken by someone else lets nobody new in.
* Bad, because Unified Login asks for a Facebook login and a business portfolio holding the creator's
  account, which a creator who never set one up has to make first.
* Bad, because the token Meta issues can do more than identify the person, though CMOkit discards it.
* Bad, because creators sign in only as testers until Meta's App Review and Business Verification
  pass.
* Neutral, because a person who signs in with Instagram and with GitHub has two accounts, as ADR-0018
  has for any two ways in.

### Confirmation

A test of the issuer asserts that Instagram leads the screen as its primary button, goes through the
configuration with no scope list, names the person by the account's ID across a changed handle, and
that Google is not offered in an in-app browser. Tests of the content server assert that a person is
let in only once their handle is proved and they are activated, that the first account keeps the
place by its ID, and that another account with the same handle is not let in.

## Pros and Cons of the Options

### Instagram through a Unified Login configuration of the sign-in's own, with activation by the proved handle, kept by the Instagram account's ID

* Good, because it meets every driver.
* Bad, because creators need a business portfolio, and testers until App Review passes.

### Keep Facebook Login and email codes only, as ADR-0018 has it

* Good, because nothing changes.
* Bad, because email codes wait for SendGrid, and neither ties the person to the handle the
  waitlist proved.

### A handle typed at sign-in, matched against the waitlist

* Good, because it needs no Meta login.
* Bad, because anyone can type another person's handle.

## More Information

Narrows ADR-0018's identity-only rule for Instagram, and builds on ADR-0045's proof of a handle.

**Follow-on obligations.** Meta's App Review and Business Verification, so creators need no tester
role. The Instagram calls are the ones the brand connection makes, and are checked against Meta only
when a person first signs in through them.

**Reversal cost.** Low: one provider, one column of the waitlist, and one field of a person's record.

## Revisit when

* Meta offers Instagram Login to new apps again, which needs no business portfolio.
* App Review passes, and the tester step can go.
