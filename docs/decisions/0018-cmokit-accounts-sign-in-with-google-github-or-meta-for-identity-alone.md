---
status: "draft"
kind: "requirement-driven"
date: 2026-10-30
decision-makers: [Geoff]
---

# ADR-0018: CMOkit accounts sign in with Google, GitHub or Meta, asking each for identity alone

**Requirements served:** `HST-02`, `HST-05`, `HST-10`, `HST-11`, `CUS-01`, `PRD-01`.

## Context and Problem Statement

The hosted offering needs accounts of CMOkit's own (`HST-02`). The `PRD-` and `CUS-` requirements
describe a product's identity, and in the hosted offering CMOkit is that product: a person signs in
by a standard protocol and an MCP client acting for them is authorized by OAuth (`PRD-01`), a
customer is who pays and has one or more users, and a person may be a user of several customers
(`CUS-01`). So nothing there conflicts; CMOkit's accounts take the role `PRD-01` gives a product's
identity provider. The person's Claude reaches CMOkit through an authorization the person grants by
signing in (`HST-05`). Signing in grants nothing beyond identity, and connecting a site or anything
else is asked for separately (`HST-02`, ADR-0020).

What each provider offers, from its own documentation:

| | Google | GitHub | Meta |
|---|---|---|---|
| Protocol for sign-in | OpenID Connect | OAuth 2.0, or a GitHub App's user access token | Facebook Login, OAuth 2.0; on the web the documented flow returns a code or token, not an ID token |
| Identity scopes | `openid`, `email`, `profile` | `read:user`, `user:email` | `public_profile`, `email` |
| Review needed for those scopes | None for non-sensitive scopes | None | None: "automatically granted to all apps using Facebook Login" |

Meta offers no sign-in for personal Instagram accounts: its Instagram APIs serve professional
accounts, and Instagram Login grants business scopes. Posting to Instagram needs
`instagram_business_content_publish` or `instagram_content_publish`, each behind App Review, so a
sign-in that asks for `public_profile` and `email` grants no posting.

## Decision Drivers

* Sign-in identifies the person and grants nothing else (`HST-02`).
* The audience already has a Google, GitHub or Meta account; Meta matters because they are creators.
* One sign-in serves CMOkit's own pages and the person's Claude (`HST-05`).
* A self-hoster runs the same sign-in with OAuth clients of their own (`HST-11`).
* No vendor between CMOkit and its customers' sign-in.

## Considered Options

* CMOkit's own sign-in through Google, GitHub and Facebook Login, with identity scopes only
* A bought identity service, such as Clerk, Auth0, WorkOS or Stytch
* Email magic links, with no provider
* Instagram Login for creators
* GitHub alone

## Decision Outcome

Chosen option: "CMOkit's own sign-in through Google, GitHub and Facebook Login, with identity scopes
only", because each provider grants identity with no review, and CMOkit has to be the authorization
server for the person's Claude either way (ADR-0029).

> A person signs in with Google by OpenID Connect, asking for `openid`, `email` and `profile`; with
> GitHub by OAuth, asking for `read:user` and `user:email`; or with Meta by Facebook Login, asking
> for `public_profile` and `email`. Nothing else is asked for at sign-in. An account is the person,
> identified by each provider's stable subject id, never by email address. A signed-in person may
> add another provider to the account; accounts are never merged by matching email. The first
> sign-in creates the account, and the account becomes a user of a customer at that customer's first
> checkout (ADR-0017), or when an existing user invites them. A person who is a user of several
> customers chooses which one they act for, and every authorization names it (`HST-10`).

### Consequences

* Good, because no provider's review stands between a new account and its first sign-in.
* Good, because a person's Meta sign-in can never be mistaken for permission to post.
* Bad, because CMOkit owns account security: session handling, linking and recovery when a person
  loses access to their only provider.
* Bad, because each self-hoster registers its own OAuth client at each provider it wants.
* Neutral, because an account with two providers is linked only by the person, so two accounts made
  by accident stay two until they ask for help.

### Confirmation

Tests sign in through stand-ins for each provider and assert the scopes asked for are exactly those
above, that a second provider with the same email does not join an account by itself, and that a
person acting for one customer is refused another's data.

## Pros and Cons of the Options

### CMOkit's own sign-in through Google, GitHub and Facebook Login, with identity scopes only

* Good, because it meets every driver.
* Bad, because three providers are three integrations to keep working.

### A bought identity service, such as Clerk, Auth0, WorkOS or Stytch

* Good, because providers, sessions, linking and recovery are built.
* Bad, because a vendor sits between CMOkit and every customer's sign-in, and every self-hoster needs
  an account there too (`HST-11`).
* Bad, because CMOkit must still issue tokens to the person's Claude as an OAuth authorization
  server, so the service saves less than it seems.

### Email magic links, with no provider

* Good, because anyone with an email address can sign in, and CMOkit already sends email (ADR-0015).
* Bad, because it puts a trip to the inbox in the middle of connecting Claude, and CMOkit carries the
  whole proof of identity itself.

### Instagram Login for creators

* Good, because it is the account most creators already use every day.
* Bad, because it serves only professional accounts and grants business permissions beyond identity,
  which breaks the rule that sign-in grants nothing else.

### GitHub alone

* Good, because one provider is the least to build, and GitHub is also how a GitHub Pages site is
  connected.
* Bad, because most of the audience has no GitHub account.

## More Information

Sources: Meta's [Facebook Login for the web](https://developers.facebook.com/documentation/facebook-login/web),
[manual login flow](https://developers.facebook.com/docs/facebook-login/guides/advanced/manual-flow/),
[Instagram Platform overview](https://developers.facebook.com/docs/instagram-platform/overview/) and
[content publishing](https://developers.facebook.com/docs/instagram-platform/content-publishing/);
Google's [OpenID Connect](https://developers.google.com/identity/openid-connect/openid-connect) and
[verification requirements](https://support.google.com/cloud/answer/13463073); GitHub's
[OAuth scopes](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/scopes-for-oauth-apps)
and [user access tokens for GitHub Apps](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-user-access-token-for-a-github-app).
All were read through search extracts of the vendors' own pages on 2026-10-30, not fetched directly.
Whether Meta requires Business Verification of an app that asks only for `public_profile` and
`email` was not found.

**Reversal cost.** Low for adding or dropping a provider; moderate for moving to a bought identity
service, which means moving every account.

## Revisit when

* Meta requires Business Verification or review for Facebook Login with identity scopes alone.
* Account recovery becomes a regular support request.
* Anthropic offers a sign-in a third party can use, so a person's Claude account could be their
  CMOkit account.
