---
status: "proposed"
kind: "requirement-driven"
date: 2026-11-10
decision-makers: [Geoff]
---

# ADR-0043: Each brand's waitlist is kept by the content server, and any page on the brand's sites joins it

**Requirements served:** `LEAD-04`, `HST-01`, `HST-10`, `HST-14`, `HST-16`, `CUS-03`.

## Context and Problem Statement

A waitlist was engine work: a site's own edge Worker took a join and its own lifecycle Worker kept
the list (ADR-0014), so a site with a waitlist ran Workers on a Cloudflare account. ADR-0042 then had
the hosted content server read one such list, CMOkit's own site's, over a service binding named for
that one site. That gave the whole hosted service a single waitlist.

Hosted CMOkit's customer is a content creator who is not a developer (`HST-01`), whose page is often
a static site, as CMOkit's own is on GitHub Pages (`HST-14`). Every brand needs a waitlist of its
own, with referral links (`LEAD-04`), and none can run a Worker or move a domain to get one
(`HST-16`). CMOkit's own brand's waitlist is also how a person gets into CMOkit during the closed
beta (`CUS-03`), and CMOkit's operator never activates people on another brand's list.

## Decision Drivers

* A brand's page on any static host takes joins, with no Worker, repository deploy or DNS change of
  the brand's own (`HST-01`, `HST-16`).
* One brand's list is never seen or changed by another brand's users (`HST-10`).
* A referral link keeps every query parameter of the page the person joined on (`LEAD-04`).
* CMOkit's operator activates people into CMOkit from CMOkit's own brand's list alone (`CUS-03`).

## Considered Options

* Kept by the content server in each brand's own records, joined by a form that posts to it
* One site's lifecycle Worker, read by the content server over a service binding, as ADR-0042 had it
* A lifecycle Worker of each brand's own

## Decision Outcome

Chosen option: "Kept by the content server in each brand's own records, joined by a form that posts
to it", because it is the only option that gives every brand its own list with nothing to deploy.

> Each brand's waitlist is kept in that brand's own records in the content server (ADR-0030). A
> brand's users list its site addresses on the account page, which then gives them a form and a
> short script to paste into any page on those sites. The form posts to `/join/<brand>` at the
> account page's origin, which takes joins only from pages on the listed sites. The answer is the
> person's referral link: the page they joined on, with every query parameter it had and their own
> code in `ref`. A person who joins with another person's code counts toward that person, and the
> list is ranked by those counts, then by who joined first. The answer also gives the person their
> place in that ranking among those not yet activated, on every join, so joining again shows where
> they stand now. A person may give an Instagram handle with their address; it is kept and shown as
> typed, unchecked, and counts for nothing in the ranking. The page's tracking tags (its `utm_*`
> parameters, ADR-0031) are kept as where the person came from, so a brand sees which piece brought
> each person. A brand's users see its list on the
> account page and activate people one by one. A person activated on the list of the brand the
> content server's `WAITLIST_CUSTOMER` names, CMOkit's own, becomes CMOkit's customer at their first
> call. Joins are slowed by a rate limit per address and by a field only bots fill in. A
> self-hosted site's edge and lifecycle keep their own waitlist (ADR-0014).

### Consequences

* Good, because every brand has a waitlist on the day it is made, from a page on any host.
* Good, because the content server no longer needs a service binding to one site for its waitlist.
* Bad, because CMOkit sends no activation email from this list yet, so a brand's users tell each
  person themselves until hosted email is built.
* Bad, because a brand's own product cannot yet ask whether an address is activated on its list; a
  brand other than CMOkit's own uses the list to rank and track people, and lets them in itself.

### Confirmation

`packages/content/test/join.test.ts` and `account.test.ts`: joins from unlisted sites are refused,
referral links keep the page's parameters, joiners get their place in line, handles and tracking
tags are kept and shown, and only a brand's users see and activate its list.

## Pros and Cons of the Options

### Kept by the content server in each brand's own records, joined by a form that posts to it

* Good, because it meets every driver.
* Bad, because the content server takes posts from anywhere, so it needs the site list, a rate
  limit and a bot trap that a site's own edge did not.

### One site's lifecycle Worker, read by the content server over a service binding, as ADR-0042 had it

* Good, because it is built, and CMOkit's own site already has the Workers.
* Bad, because the service binding names one site, so the whole service has one waitlist, which
  fails `HST-10` for every brand after CMOkit's own.

### A lifecycle Worker of each brand's own

* Good, because each brand would keep its list on an account of its own.
* Bad, because it needs a Cloudflare account and a deploy of the brand's own, which `HST-01` and
  `HST-16` rule out.

## More Information

**Follow-on obligations.** An activation email from the list, once hosted email is built. A way for
a brand's own product to ask whether an address is activated, when a brand other than CMOkit's own
needs it. This record replaces the waitlist clause of ADR-0042.

**Reversal cost.** Low: the list is one table in each brand's records and is in its export.

## Revisit when

* A brand needs its list to send email on joining or activation.
* A brand's own product needs to let activated people in by itself.
