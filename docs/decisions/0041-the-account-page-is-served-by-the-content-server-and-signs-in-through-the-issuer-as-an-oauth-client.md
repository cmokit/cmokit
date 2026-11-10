---
status: "proposed"
kind: "requirement-driven"
date: 2026-11-10
decision-makers: [Geoff]
---

# ADR-0041: The account page is served by the content server, and signs in through the issuer as an OAuth client

**Requirements served:** `HST-01`, `HST-10`, `HST-13`, `HST-17`.

## Context and Problem Statement

A hosted customer works with CMOkit in Claude. They also need a place outside Claude to see their
account: who they are signed in as, their access and beta terms, their connections, their brand
context, and a way to download everything CMOkit holds for them (`HST-13`, `HST-17`). Activated
people's accounts are at `app.cmokit.ai`, and its tenants are separate customers (`HST-10`).

The people who use it are content creators, not developers (`HST-01`). They already sign in to
CMOkit through the issuer, with Google, GitHub, Meta or an email code (ADR-0018), and their records
are in the content server's customer objects. A page that held its own accounts, or its own copy of
the records, would be a second sign-in and a second place for the records to disagree.

## Decision Drivers

* One sign-in for Claude and the page, and one set of records (`HST-01`).
* Only a customer's own users see its account (`HST-10`).
* No secret for the page to hold, and no token a page script can read.
* The smallest thing that shows the account and the export (`HST-13`, `HST-17`).

## Considered Options

* Served by the content server at an origin of its own, signing in through the issuer as a public
  OAuth client with PKCE, with the token in an HttpOnly cookie
* A separate Worker or single-page app for the account, with its own sessions
* No page: the account is seen and changed only in Claude
* The account shown on CMOkit's marketing site

## Decision Outcome

Chosen option: "Served by the content server at an origin of its own, signing in through the issuer
as a public OAuth client with PKCE, with the token in an HttpOnly cookie", because it reuses the one
sign-in and the one set of records and adds no secret.

> The account page is served by the content server Worker at `APP_URL`, as `https://app.cmokit.ai`.
> It signs a person in through the issuer as a public OAuth client named by its Client ID Metadata
> Document at `<APP_URL>/client.json`, with PKCE and the content server's audience, and keeps the
> access token in an HttpOnly, Secure, SameSite=Lax cookie. It serves the customer the hosted MCP
> address would serve, only to that customer's users. It shows the account and downloads its export;
> changes are made in Claude. The issuer allows `<APP_URL>/callback` as a redirect only where its own
> `APP_URL` names it.

### Consequences

* Good, because a person signs in the same way as in Claude and sees exactly what Claude sees.
* Good, because the page holds no secret, and a script on it cannot read the token.
* Bad, because the page is read-only until a change is worth a form of its own; until then the page
  says to ask Claude.
* Neutral, because the session lasts as long as the access token, an hour, and then the person signs
  in again.

### Confirmation

Tests in `packages/content/test/account.test.ts` check the metadata document, the PKCE sign-in, the
state check, the cookie's attributes, the refusal of other customers' people and other audiences,
and the export. A test in `packages/issuer/test/worker.test.ts` checks that the account page's
callback is allowed only where `APP_URL` names it.

## Pros and Cons of the Options

### Served by the content server at an origin of its own, signing in through the issuer as a public OAuth client with PKCE, with the token in an HttpOnly cookie

* Good, because it meets every driver with one more route and one more allowed redirect.
* Bad, because the issuer has to fetch the page's metadata document from the same Cloudflare account,
  which is checked only at deploy.

### A separate Worker or single-page app for the account, with its own sessions

* Good, because the account's code would deploy apart from the content server's.
* Bad, because it would need its own sessions and its own way to the customer objects, which the
  content server already has, for a page of a few sections.

### No page: the account is seen and changed only in Claude

* Good, because it needs nothing built.
* Bad, because `HST-17` asks for a page, and the export is a file a person downloads.

### The account shown on CMOkit's marketing site

* Good, because people already visit it.
* Bad, because the marketing site is engine work for CMOkit as one customer, and an account belongs to
  every customer, so it would carry every tenant's accounts on one tenant's site.

## More Information

**Follow-on obligations.** `app.cmokit.ai` is a route of the content server's Worker, and `APP_URL`
is set on both the content server and the issuer. Profile and skill settings, and changes made on the
page, are follow-on work under `HST-17`.

**Reversal cost.** Low: the page is a few routes of the content server, and removing `APP_URL`
removes it and its redirect.

## Revisit when

* The page needs to change records, not only show them.
* People need to stay signed in longer than an access token lasts.
