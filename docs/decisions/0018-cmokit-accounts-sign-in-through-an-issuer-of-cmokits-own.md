---
status: "draft"
kind: "requirement-driven"
date: 2026-10-30
decision-makers: [Geoff]
---

# ADR-0018: CMOkit accounts sign in through an issuer of CMOkit's own, with an email code, Google, GitHub or Meta, and no password

**Requirements served:** `HST-02`, `HST-05`, `HST-10`, `HST-11`, `NFR-06`, `CUS-01`, `PRD-01`.

## Context and Problem Statement

The hosted offering needs accounts of CMOkit's own, signed in with an email address, Google, GitHub
or Meta, where signing in grants nothing beyond identity (`HST-02`). The `PRD-` and `CUS-`
requirements describe a product's identity, and in the hosted offering CMOkit is that product: a
person signs in by a standard protocol and an MCP client acting for them is authorized by OAuth
(`PRD-01`), a customer is who pays and has one or more users, and a person may be a user of several
customers (`CUS-01`). So nothing there conflicts; CMOkit's accounts take the role `PRD-01` gives a
product's identity provider. The person's Claude reaches CMOkit through an authorization the person
grants by signing in (`HST-05`). Something has to issue that authorization, and every part of CMOkit
runs on Cloudflare and scales to zero (`NFR-06`, ADR-0003).

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

Claude registers with an authorization server by a Client ID Metadata Document that Anthropic hosts,
when the server advertises support for one, and otherwise by dynamic client registration, which the
MCP specification of 2026-07-28 deprecates. Its redirect is `https://claude.ai/api/mcp/auth_callback`,
and it requires PKCE with S256. Cloudflare's OAuth library makes a Worker an OAuth 2.1 authorization
server; from its 1.0 release it runs the authorization server and the resource server as separate
Workers, and supports Client ID Metadata Documents.

CFOKit, a separate product, chose Keycloak behind a written contract: a complete identity provider,
with passwords, second factors and passkeys, which CMOkit would not have to write. CFOKit runs it as
one instance that is always on, with a database of its own, because "a sign-in that waits for a JVM
to start is a sign-in that times out".

## Decision Drivers

* Sign-in identifies the person and grants nothing else (`HST-02`).
* Scales to zero, on Cloudflare alone (`NFR-06`).
* CMOkit keeps no password.
* No dependency on another product's identity provider.
* Claude registers by its published identity, without the deprecated dynamic registration.
* A self-hoster runs the same issuer with OAuth clients of their own (`HST-11`).

## Considered Options

* An issuer Worker of CMOkit's own, on Cloudflare's OAuth library, offering an email code, Google,
  GitHub and Facebook Login
* Keycloak, run as CFOKit runs it
* Sharing CFOKit's issuer
* A bought identity service, such as Clerk, Auth0, WorkOS or Stytch
* Passwords, as well as or instead of email codes
* Magic links in place of email codes
* Instagram Login for creators
* Google, GitHub and Meta only, with no email

## Decision Outcome

Chosen option: "An issuer Worker of CMOkit's own, on Cloudflare's OAuth library, offering an email
code, Google, GitHub and Facebook Login", because it is the only option that scales to zero on
Cloudflare, stores no password, and leaves the protocol's hard parts to a maintained library.

> CMOkit's issuer is a Worker of its own, built on Cloudflare's OAuth library, and the only part of
> CMOkit that issues tokens; every other part only checks them (ADR-0029). Its sign-in page offers
> four ways in, asking for nothing beyond identity:
>
> * **Google**, by OpenID Connect, asking for `openid`, `email` and `profile`.
> * **GitHub**, by OAuth, asking for `read:user` and `user:email`.
> * **Meta**, by Facebook Login, asking for `public_profile` and `email`.
> * **Email**: the person enters an address and is sent a six-digit code through the messaging
>   interface's sending service (ADR-0015), with a sending key of the issuer's own. The code is
>   transactional mail: it belongs to no unsubscribe group, so unsubscribing from a lead's sequence
>   never stops a sign-in. The code is kept hashed, expires after ten minutes and allows five
>   attempts, and sending is limited per address and per network. The page says the same whether or
>   not the address has an account.
>
> CMOkit keeps no password. An account is a person, found by the sign-in identity they used: a
> provider and its stable subject id, or an email address proven by code. Accounts are never merged
> by matching email; a signed-in person adds another way in themselves, and a proven email address
> lets them back in when a provider fails them. The first sign-in creates the account, which becomes
> a user of a customer at that customer's first checkout (ADR-0017) or by invitation.
>
> The issuer registers Claude by its Client ID Metadata Document and offers no dynamic registration.
> It accepts a client only if every redirect it names is Claude's callback over https or a loopback
> address, requires PKCE with S256, and names itself in every authorization response. A token names
> the person and nothing else; which customer a connection serves is named in its address
> (ADR-0029, `HST-10`). Passkeys and second factors of CMOkit's own are not built.

### Consequences

* Good, because sign-in costs nothing while nobody signs in: no Java server and no database.
* Good, because no password is stored, reset or open to credential stuffing.
* Good, because Claude registers by its published identity, with nothing to clean up when dynamic
  registration is removed.
* Bad, because CMOkit owns security-critical code: the sign-in page, the provider callbacks, the email
  codes and account linking. It is tested against a written list of attacks: guessing codes, flooding
  an inbox, finding out who has an account, forging a sign-in, redirecting it elsewhere, and taking
  over an account by linking.
* Bad, because an email code is as safe as the person's mailbox, and CMOkit offers no second factor
  of its own; Google, GitHub and Meta offer theirs.
* Bad, because the library keeps its tokens in Workers KV, not a Durable Object (ADR-0035).
* Neutral, because a self-hoster registers OAuth clients at each provider they want, and needs a
  sending key for email codes.

### Confirmation

Tests sign in through stand-ins for each provider and for the messaging interface, and assert: the
scopes asked for are exactly those above; a code expires, locks after five attempts, and is limited
per address and network, and is sent outside every unsubscribe group; the page answers alike for
known and unknown addresses; a second provider
with the same email does not join an account by itself; and a client naming any other redirect is
refused.

## Pros and Cons of the Options

### An issuer Worker of CMOkit's own, on Cloudflare's OAuth library, offering an email code, Google, GitHub and Facebook Login

* Good, because it meets every driver.
* Bad, because the sign-in page and its four flows are CMOkit's to keep secure.

### Keycloak, run as CFOKit runs it

* Good, because it is a complete identity provider: passwords, resets, second factors, passkeys,
  social sign-in and an admin console, none of them written by CMOkit.
* Bad, because it is a Java server needing a relational database, and Workers run neither, so it
  breaks the rules that CMOkit runs on Cloudflare alone and scales to zero (`NFR-06`).
* Bad, because CFOKit's own record finds it supports dynamic registration but not Client ID
  Metadata Documents.

### Sharing CFOKit's issuer

* Good, because a person would have one account across both products, and CMOkit would build nothing.
* Bad, because the two products become one system: an outage, a release or a configuration change
  in one reaches the other's customers.
* Bad, because it brings every drawback of Keycloak above with it.

### A bought identity service, such as Clerk, Auth0, WorkOS or Stytch

* Good, because providers, codes, sessions, linking and recovery are built.
* Bad, because a vendor sits between CMOkit and every customer's sign-in, and every self-hoster needs
  an account there too (`HST-11`).

### Passwords, as well as or instead of email codes

* Good, because everyone knows how they work.
* Bad, because storing, verifying and resetting passwords is the most attacked part of sign-in, and
  an email code reaches the same people without it.

### Magic links in place of email codes

* Good, because one tap signs the person in.
* Bad, because a link opens in whatever browser the mail app chooses, often not the one holding
  Claude's sign-in, which breaks connecting Claude on a phone.

### Instagram Login for creators

* Good, because it is the account most creators already use every day.
* Bad, because it serves only professional accounts and grants business permissions beyond identity,
  which breaks the rule that sign-in grants nothing else.

### Google, GitHub and Meta only, with no email

* Good, because it is the least to build.
* Bad, because it leaves out people on Microsoft 365 or Outlook, and people who will not use these
  accounts for work, and gives no way back in to someone who loses their only provider.

## More Information

Sources: Meta's [Facebook Login for the web](https://developers.facebook.com/documentation/facebook-login/web),
[manual login flow](https://developers.facebook.com/docs/facebook-login/guides/advanced/manual-flow/),
[Instagram Platform overview](https://developers.facebook.com/docs/instagram-platform/overview/) and
[content publishing](https://developers.facebook.com/docs/instagram-platform/content-publishing/);
Google's [OpenID Connect](https://developers.google.com/identity/openid-connect/openid-connect) and
[verification requirements](https://support.google.com/cloud/answer/13463073); GitHub's
[OAuth scopes](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/scopes-for-oauth-apps);
Cloudflare's [workers-oauth-provider](https://github.com/cloudflare/workers-oauth-provider) and
[its 1.0 release](https://developers.cloudflare.com/changelog/post/2026-10-01-workers-oauth-provider-1x/);
the MCP specification's [client registration, 2026-07-28](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization/client-registration).
These were read through search extracts of the vendors' own pages on 2026-10-30, not fetched
directly. Anthropic's [connector authentication](https://claude.com/docs/connectors/building/authentication)
was read directly. CFOKit's records on its [identity provider](https://github.com/cfokit/cfokit/blob/main/docs/decisions/0019-identity-provider-conformance-contract.md),
its [production deployment](https://github.com/cfokit/cfokit/blob/main/docs/decisions/0060-production-is-one-gcp-project-deployed-on-merge.md)
and its [redirect restriction](https://github.com/cfokit/cfokit/blob/main/docs/decisions/0064-a-registered-client-redirects-only-to-a-known-host.md)
were read in that repository. Whether Meta requires Business Verification of an app that asks only
for `public_profile` and `email` was not found.

**Reversal cost.** Moderate. The content server only checks tokens, so another issuer replaces this
one without changing it (ADR-0029); accounts and their sign-in identities would move.

## Revisit when

* People ask for passkeys or a second factor on CMOkit's own sign-in.
* Email codes are abused, by flooding inboxes or guessing, beyond what the limits stop.
* Meta requires Business Verification or review for Facebook Login with identity scopes alone.
* Anthropic offers a sign-in a third party can use, so a person's Claude account could be their
  CMOkit account.
