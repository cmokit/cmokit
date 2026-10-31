---
status: "draft"
kind: "requirement-driven"
date: 2026-10-30
decision-makers: [Geoff]
---

# ADR-0020: The hosted content service connects no site, and a piece's destination is any URL

**Requirements served:** `HST-01`, `CNT-11`, `CNT-12`, `CNT-21`.

## Context and Problem Statement

A piece has one destination and one tracked link (`CNT-12`). For an event, the destination is its
page on the event platform (`CNT-11`); for anything else, it is a page that already sells it, on the
customer's site or on a store, course or booking platform. Content works with none of the engine
(`CNT-21`), and setup is an account, a subscription and, if the customer sells through one, its
event platform (`HST-01`).

Connecting a customer's site would let CMOkit publish pages to it, through a GitHub App for a site on
GitHub Pages or through a host's or CMS's API elsewhere. Those differ by host: Webflow's API, for
one, publishes CMS items but creates no new static pages, and several creator platforms have no
public API. The engine already publishes to a site as a change to its repository or drafts in its
CMS, self-hosted (ADR-0002).

## Decision Drivers

* Setup stays an account, a subscription and an event platform (`HST-01`).
* Nothing is built that content does not need.
* CMOkit holds no access to a customer's site it does not use.

## Considered Options

* No site connection: a piece's destination is any URL that already exists
* A publishing interface with a GitHub App adapter, to publish landing pages to the customer's site
* Adapters for hosts with publishing APIs, such as Webflow, WordPress.com and Shopify

## Decision Outcome

Chosen option: "No site connection: a piece's destination is any URL that already exists", because
content needs only somewhere to send people, and every offer it promotes already has a page.

> The hosted content service connects no site and publishes nothing. When a piece is planned, the
> person gives its destination, or the event platform supplies it (ADR-0032), and the content server
> builds its tracked link from that URL (ADR-0031).

### Consequences

* Good, because setup has one step fewer, and CMOkit holds no access to anyone's site.
* Good, because there is no adapter per host to build or keep working.
* Bad, because an offer with no page of its own cannot be promoted until the person makes one.

### Confirmation

Enforced by review: the content server has no tool and no adapter that writes to a site.

## Pros and Cons of the Options

### No site connection: a piece's destination is any URL that already exists

* Good, because it meets every driver.
* Bad, because making a missing landing page is left to the person.

### A publishing interface with a GitHub App adapter, to publish landing pages to the customer's site

* Good, because a GitHub App can be installed on one repository and limited to committing and opening
  pull requests, so a publish would be reviewable and reversible.
* Bad, because no early customer needs a page published, so it is setup and code without a job.

### Adapters for hosts with publishing APIs, such as Webflow, WordPress.com and Shopify

* Good, because more creators could publish from the conversation.
* Bad, because each host publishes in its own shape, and nothing in content calls for it.

## More Information

Sources: GitHub's [choosing permissions for a GitHub App](https://docs.github.com/en/apps/creating-github-apps/registering-a-github-app/choosing-permissions-for-a-github-app);
Webflow's [live CMS items](https://developers.webflow.com/data/reference/cms/collection-items/live-items/create-item-live),
read through search extracts on 2026-10-30.

**Reversal cost.** Low: a publishing interface can be added later, behind the content server, without
changing a piece or a link.

## Revisit when

* Customers regularly promote offers that have no page to send people to.
