---
status: "proposed"
kind: "requirement-driven"
date: 2026-11-13
decision-makers: [Geoff]
---

# ADR-0050: A brand's funnel counts visits from its waitlist form, as daily counts behind a store interface

**Requirements served:** `LEAD-04`, `MSR-01`, `MSR-08`, `NFR-03`.

## Context and Problem Statement

A hosted brand's funnel starts at its waitlist (ADR-0044): people join from a form pasted on any page
of the brand's site (ADR-0043), and each join keeps the page's tracking tags. That counts joins and
nothing before them, so no one can say what share of a page's visitors joined, or which source
converts worst. Improving the page needs that rate.

The engine measures visits through its edge Worker and PostHog (ADR-0010), but a hosted brand's site
is often static, as CMO Kit's own is on GitHub Pages, with no edge in front of it. Reading the site's
own PostHog (ADR-0036) needs the brand to run PostHog and hand over a key. The question is how a
hosted brand's visits are counted, and where the counts are kept.

## Decision Drivers

* Works on any page that carries the waitlist form, with nothing else to install or configure.
* The funnel, from visit to activation, is readable per page and source in one place.
* Nothing that identifies a visitor is kept, and no query parameter beyond the tracking tags.
* Each brand's counts are its own (`HST-10`).
* Counts can move to an analytics store later without touching the form or the tool.

## Considered Options

* The waitlist form counts its page once a session, kept as daily counts per page and source in the
  brand's records, behind a store interface
* PostHog on the brand's site, read with ADR-0036's read-only key
* Cloudflare Web Analytics on the brand's site
* Workers Analytics Engine from the start

## Decision Outcome

Chosen option: "The waitlist form counts its page once a session, kept as daily counts per page and
source in the brand's records, behind a store interface", because the form is already on every page
the funnel starts from, the counts sit beside the joins they are compared with, and the interface
keeps a later move to an analytics store a new adapter.

> The form's script posts the page's address to the brand's join address with a `visit` field, once a
> browser session per page, with no cookie. Only a page on one of the brand's listed sites is counted,
> as with joins. The brand's records add one to a count for the day, the page without its query, and
> the page's tracking tags (`utm_*`), and keep nothing else. A join now keeps its page too.
> `funnel_read` gives, for a period, each page and source with its visits, joins, proved handles and
> activations, and joins divided by visits, with the first day visits were counted. The counts are
> kept through a `VisitStore` interface whose first adapter is the brand's own SQLite records
> (ADR-0030); the export holds them and closing erases them.

### Consequences

* Good, because any brand's site that pastes the form gets its funnel, CMO Kit's and CFO Kit's
  included, with no analytics account.
* Good, because a visitor leaves no identity, cookie or address behind.
* Bad, because a page counts only where the form is, so a visitor who leaves from another page is not
  counted.
* Bad, because a browser that blocks the script, or a bot that runs it, changes the count, and nothing
  separates people from bots beyond the site list.
* Bad, because a site that pasted the older form counts nothing until it pastes this one.

### Confirmation

`packages/content/test/join.test.ts`: visits count per day, page and source, only from the brand's
sites, without any other query parameter; `funnel_read`'s numbers over one day and two; the export
holds the counts; the form's script counts once a session without cookies.

## Pros and Cons of the Options

### The waitlist form counts its page once a session, kept as daily counts per page and source in the brand's records, behind a store interface

* Good, because it meets every driver.
* Bad, because it counts the form's page alone, not the whole site.

### PostHog on the brand's site, read with ADR-0036's read-only key

* Good, because PostHog counts every page and keeps sessions and paths.
* Bad, because every brand must run PostHog and hand over a key, which a non-technical creator will
  not do, and the joins would still be compared from two places.

### Cloudflare Web Analytics on the brand's site

* Good, because it is free and keeps no visitor identity.
* Bad, because the brand pastes a second script, and its numbers are read in Cloudflare's dashboard,
  not beside the joins.

### Workers Analytics Engine from the start

* Good, because it is built for counts at volume, queried with SQL.
* Bad, because it is shared across brands, so every query must be scoped by brand by hand, and the
  volume of a closed beta does not need it yet.

## More Information

**Follow-on obligations.** The content skill's weekly review reads `funnel_read` to find the weakest
stage and source. The account page's setup tells a brand to paste the form where the funnel starts.

**Reversal cost.** Low: a new store is a new adapter of `VisitStore`, and the form and the tool are
unchanged.

## Revisit when

* A brand's visits reach a volume where a row per day, page and source is slow to read, or a
  question needs more than counts: then an analytics store, such as Workers Analytics Engine,
  ClickHouse or Snowflake, behind the same interface.
* A brand needs its whole site counted, not only the form's page.
* Bots inflate the counts enough to change a decision.
