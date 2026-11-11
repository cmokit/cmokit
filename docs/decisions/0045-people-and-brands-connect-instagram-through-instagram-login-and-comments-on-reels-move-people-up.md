---
status: "proposed"
kind: "requirement-driven"
date: 2026-11-11
decision-makers: [Geoff]
---

# ADR-0045: People and brands connect Instagram through Instagram Login, and comments on a brand's Reels move people up its waitlist

**Requirements served:** `LEAD-04`, `HST-01`, `HST-10`.

## Context and Problem Statement

A brand's waitlist ranks people by the people who joined through their referral link (`LEAD-04`,
ADR-0043). The brand also wants people to move up by engaging with its Instagram: the third stage of
its funnel (ADR-0044). That needs two facts: which Instagram account is a person's, and which of the
brand's posts that account engaged with. A handle a person types proves neither, since anyone can
type another person's handle.

Meta's Instagram Platform reaches only professional accounts, business or creator: "To use the
APIs, your app users must have an Instagram professional account." The Instagram Basic Display API,
which reached personal accounts, ended on December 4, 2024. The people on a hosted brand's waitlist
are creators who earn from their content, so their accounts are professional ones. Instagram tells a
business account who commented on its posts, with the `instagram_business_manage_comments`
permission, but not who liked them.

## Decision Drivers

* A person's place moves only for an Instagram account proven to be theirs.
* A person connects with a few taps, and CMOkit keeps no token of theirs.
* The brand sets it up with no terminal or developer step (`HST-01`), and one brand's Instagram is
  never read for another (`HST-10`).

## Considered Options

* Instagram Login for both: a person connects to prove their account; the brand connects its own, and
  comments on its recent Reels are counted
* A typed handle, matched against the commenters on the brand's Reels
* Instagram Login through Facebook Login for Business

## Decision Outcome

Chosen option: "Instagram Login for both", because it is the only option that proves whose account
is whose.

> The content server has one Instagram app, the Instagram product of a Meta app, whose redirect
> address is the account page's `/instagram/callback`. After joining, a person is offered Connect
> Instagram, which asks only `instagram_business_basic`; CMOkit keeps the account's ID and username
> with their waitlist entry and discards the token. An account is one person's: connecting it from
> another address moves it there. A user of the brand connects the brand's own account from the
> account page with `instagram_business_basic` and `instagram_business_manage_comments`; its
> long-lived token is sealed with the brand's other credentials, and refreshed when it is a day old
> and the brand counts. Counting reads the brand's 25 most recent Reels and the commenters on each,
> and each person's boost is the number of those Reels their connected account commented on. The
> waitlist is ranked by referrals plus that boost, then by who joined first. A person whose account
> is not professional is told to switch to a business or creator account. The brand counts from the
> account page; nothing counts on a schedule yet.

### Consequences

* Good, because only a proven account moves a person up, and only for engagement Instagram reports.
* Good, because a person's connection keeps nothing that could act on their account.
* Bad, because until Meta's App Review grants Advanced Access, only accounts added to the Meta app as
  testers can connect, which is enough to try it on CMOkit's own brand and not for a public launch.
* Bad, because counting is a button, so a ranking is only as fresh as the last count, and a brand
  that stops counting for 60 days must connect its account again.

### Confirmation

`packages/content/test/instagram.test.ts`: a person's connection proves their handle and is used
once; the brand's connection is kept and refreshed; comments on its Reels move a connected person up;
a refusal or a personal account gets the page that says what to do.

## Pros and Cons of the Options

### Instagram Login for both: a person connects to prove their account; the brand connects its own, and comments on its recent Reels are counted

* Good, because it meets every driver.
* Bad, because it needs a Meta app, and App Review before people outside the app's testers can connect.

### A typed handle, matched against the commenters on the brand's Reels

* Good, because a person with any kind of account could take part, with no Meta app review for them.
* Bad, because anyone can type another person's handle and take their comments, which the first
  driver rules out.

### Instagram Login through Facebook Login for Business

* Good, because it reaches the same professional accounts.
* Bad, because the account must be linked to a Facebook Page and the person signs in with Facebook,
  more steps for a creator than Instagram Login.

## More Information

**Follow-on obligations.** App Review for Advanced Access to `instagram_business_basic` and
`instagram_business_manage_comments`, with Meta's business verification, before the public beta.
Counting on a schedule, which also keeps the brand's token fresh. Reading past the first page of
comments on a busy Reel.

**Reversal cost.** Low: the connections are two columns of the waitlist records and one connection.

## Revisit when

* Meta reaches personal accounts again, or changes what it reports about commenters.
* A brand's Reels get more comments than one page holds.
