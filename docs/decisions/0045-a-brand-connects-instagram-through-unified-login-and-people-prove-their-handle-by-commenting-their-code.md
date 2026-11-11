---
status: "proposed"
kind: "requirement-driven"
date: 2026-11-11
decision-makers: [Geoff]
---

# ADR-0045: A brand connects Instagram through Unified Login, and people prove their handle by commenting their code on its Reels

**Requirements served:** `LEAD-04`, `HST-01`, `HST-10`.

## Context and Problem Statement

A brand's waitlist ranks people by the people who joined through their referral link (`LEAD-04`,
ADR-0043). The brand also wants people to move up by engaging with its Instagram: the third stage of
its funnel (ADR-0044). That needs two facts: which Instagram handle is a person's, and which of the
brand's Reels that handle commented on. A handle a person types proves neither, since anyone can
type another person's handle.

Meta offers two ways to reach the Instagram API. Instagram Login is not offered to new Meta apps:
CMOkit's app, made on November 11, 2026, says "API setup with Instagram login is not available for
newer apps. Your app uses API setup with Unified login instead." Unified Login is built on Facebook
Login for Business: the person logging in picks a business portfolio, and the token is the
portfolio's, which does not expire. Every person on a waitlist would need a business portfolio of
their own to log in that way. The brand's own token can read the comments on its Reels, with each
commenter's username and the comment's text.

## Decision Drivers

* A person's place moves only for a handle proven to be theirs.
* A person on the waitlist takes part with what they already have: an Instagram account of any kind,
  and no login to CMOkit's Meta app.
* The brand sets it up with no terminal or developer step (`HST-01`), and one brand's Instagram is
  never read for another (`HST-10`).

## Considered Options

* The brand connects through Unified Login, and a person proves their handle by commenting their
  referral code on one of the brand's Reels
* Everyone connects through Unified Login
* Everyone connects through Instagram Login
* A typed handle, matched against the commenters on the brand's Reels

## Decision Outcome

Chosen option: "The brand connects through Unified Login, and a person proves their handle by
commenting their referral code", because it is the only option that proves whose handle is whose
without asking each person for a business portfolio.

> The content server has one Meta app, with a Facebook Login for Business configuration made under
> API setup with Unified login, whose redirect address is the account page's `/instagram/callback`.
> A user of the brand connects the brand's account from the account page; CMOkit keeps the first
> Instagram account the portfolio shares, by its ID and username, with the portfolio's token sealed
> with the brand's other credentials. Once the brand is connected, joining the waitlist answers with
> the brand's account and the person's referral code, and the form's third step asks them to comment
> the code on one of the brand's Reels. Counting reads the comments on the brand's 25 most recent
> Reels. A comment that carries a person's code ties its commenter's handle to that person, unless
> the person or the handle is tied already: the first proof stands. Each tied person's boost is the
> number of those Reels their handle commented on. The waitlist is ranked by referrals plus that
> boost, then by who joined first. The brand counts from the account page; nothing counts on a
> schedule yet. Without the Meta app's ID, secret and configuration, the form offers no Instagram
> step.

### Consequences

* Good, because only a proven handle moves a person up, and a person with a personal account can
  take part.
* Good, because CMOkit holds no token of anyone but the brand.
* Good, because CMOkit's own brand needs no App Review: its users have a role on the Meta app.
* Bad, because a code commented on a Reel is public, and the first commenter of a code wins it; a
  person whose code was taken by someone else asks the brand.
* Bad, because another brand can connect only after Meta's App Review grants Advanced Access and
  Meta verifies CMOkit's business portfolio.
* Bad, because counting is a button, so a ranking is only as fresh as the last count.

### Confirmation

`packages/content/test/instagram.test.ts`: the brand's connection is kept and used once per start;
joining answers with the brand's account and the person's code only once the brand is connected and
an app is set up; a commented code proves a handle, and the first proof stands; comments on the
brand's Reels move a proven person up.

## Pros and Cons of the Options

### The brand connects through Unified Login, and a person proves their handle by commenting their referral code on one of the brand's Reels

* Good, because it meets every driver.
* Bad, because the code is public once commented.

### Everyone connects through Unified Login

* Good, because a login proves an account directly.
* Bad, because each person would need a business portfolio and a professional account, which the
  second driver rules out.

### Everyone connects through Instagram Login

* Good, because a creator logs in with Instagram alone.
* Bad, because Meta does not offer it to new apps.

### A typed handle, matched against the commenters on the brand's Reels

* Good, because it is the fewest steps for a person.
* Bad, because anyone can type another person's handle and take their comments, which the first
  driver rules out.

## More Information

**Follow-on obligations.** Meta's business verification and App Review for Advanced Access before a
second brand connects. Counting on a schedule. Reading past the first page of comments on a busy
Reel.

**Reversal cost.** Low: the proofs are two columns of the waitlist records, and the brand's account
is one connection.

## Revisit when

* Meta offers Instagram Login to new apps again, or changes what it reports about commenters.
* A brand's Reels get more comments than one page holds.
