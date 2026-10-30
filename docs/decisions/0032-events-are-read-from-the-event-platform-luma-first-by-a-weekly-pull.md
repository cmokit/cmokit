---
status: "draft"
kind: "requirement-driven"
date: 2026-10-30
decision-makers: [Geoff]
---

# ADR-0032: Events and registrations are read from the event platform behind an events interface, Luma first, by a pull when results are read

**Requirements served:** `CNT-10`, `CNT-11`, `CNT-19`, `CNT-20`, `HST-04`, `HST-10`, `NFR-03`, `NFR-06`.

## Context and Problem Statement

An event business sells through an event platform, not through CMOkit's checkout, so for it the
conversion is a registration on that platform (`CNT-11`). Its upcoming events are what content is
planned from (`CNT-10`), and are read from the platform, never entered a second time (`CNT-11`).
Registrations are attributed to pieces and read weekly (`CNT-19`). Real capacity and check-ins can
feed copy and recaps (`CNT-20`). The platform sits behind an interface named for the job (`NFR-03`).
Several businesses may share one deployment, each with its own calendar and key (`HST-10`), and the
key never passes through a conversation (`HST-04`).

Luma, as its own documentation describes it: a REST API at `https://public-api.luma.com`,
authenticated by an `x-luma-api-key` header. A key belongs to one calendar and grants full access to
it; an organization's key reaches all its calendars; no read-only key is documented. The API needs
Luma Plus on the calendar, $59 a month billed annually or $69 month to month. It lists a calendar's
events and an event's guests, with cursor pagination, at up to 200 requests a minute per calendar.
Each guest carries `attribution_params`, keyed by the URL parameters its registration link had, and
each ticket a `checked_in_at`. A single guest's record includes its ticket orders and any coupon;
the field names for the amount paid were not confirmed, and no field for places remaining was found.
Webhooks, also on Luma Plus, are created in Luma's dashboard and signed with HMAC-SHA256; among them
is `guest.registered`. Luma also offers an MCP server of its own.

## Decision Drivers

* No event is kept in CMOkit; the platform is the source of truth (`CNT-11`).
* Guests' personal data stays between the platform and CMOkit, and only counts reach the model.
* Nothing runs between reviews, and nothing needs a receiver to be up (`NFR-06`).
* The least the customer has to set up in the platform.
* The next platform is an adapter (`NFR-03`).

## Considered Options

* An events interface with a Luma adapter, reading upcoming events when a plan is made and
  registrations when results are read
* The same, with a webhook receiver recording registrations as they happen
* The customer's own Luma connector in their Claude, with CMOkit holding no key
* A guest list the person exports from Luma and uploads to the conversation
* Events entered in CMOkit by hand

## Decision Outcome

Chosen option: "An events interface with a Luma adapter, reading upcoming events when a plan is made
and registrations when results are read", because nothing needs to be real time, and a pull keeps no
copy, needs no receiver and asks nothing of the customer in Luma beyond a key.

> The events interface lists a calendar's upcoming events (name, page, start, capacity where the
> platform gives it) and reads an event's registrations and check-ins, each with its attribution
> parameters. Its first adapter is Luma's, with a calendar key the customer enters on CMOkit's page
> (ADR-0019), kept encrypted in the customer's object (ADR-0030). `offers_list` reads upcoming
> events when the week is planned. `results_read` reads each recent event's guests, counts
> registrations and check-ins per `utm_content`, joins them to pieces, and returns and keeps only the
> counts. A registration with no piece's `utm_content` is counted as unattributed. Places remaining
> are used in copy only when the platform states them; nothing estimates them. Revenue per piece waits
> until the amount a guest paid is confirmed in Luma's API.

### Consequences

* Good, because the customer sets up nothing in Luma beyond a key, and CMOkit keeps no attendee.
* Good, because a week's read is a handful of calls per event, well inside Luma's rate limit.
* Bad, because results are as fresh as the last read, not live.
* Bad, because Luma's API needs Luma Plus, a cost the customer bears, and a calendar key that can also
  write, since no read-only key is documented.

### Confirmation

Tests run the Luma adapter against recorded responses and assert the counts per piece, that no guest
field other than attribution and check-in leaves the adapter, and that no handler names Luma.

## Pros and Cons of the Options

### An events interface with a Luma adapter, reading upcoming events when a plan is made and registrations when results are read

* Good, because it meets every driver.
* Bad, because a full-access key is held for a read-only job.

### The same, with a webhook receiver recording registrations as they happen

* Good, because registrations would be counted the moment they happen.
* Bad, because nothing in content needs them before the weekly review, and the customer would have to
  create the webhook in Luma's dashboard, while CMOkit verifies, deduplicates and stores each event.

### The customer's own Luma connector in their Claude, with CMOkit holding no key

* Good, because CMOkit would hold no Luma key at all.
* Bad, because guests' names and emails would reach the model, and counting them per piece would be
  left to the model.

### A guest list the person exports from Luma and uploads to the conversation

* Good, because it needs no API, no key and no Luma Plus.
* Bad, because the export is every guest's personal data in the conversation, and it is a chore every
  week, awkward on a phone.

### Events entered in CMOkit by hand

* Good, because it works with any platform, or none.
* Bad, because every event is entered twice and goes stale, which `CNT-11` rules out.

## More Information

Sources: Luma's [API getting started](https://docs.luma.com/reference/getting-started-with-your-api),
[list events](https://docs.luma.com/reference/get_v1-calendars-events-list),
[list guests](https://docs.luma.com/reference/get_v1-events-guests-list),
[rate limits](https://docs.luma.com/reference/rate-limits), [event referrals](https://help.luma.com/p/event-referrals),
[webhooks](https://help.luma.com/p/webhooks), [Luma API](https://help.luma.com/p/luma-api) and
[Luma Plus](https://help.luma.com/p/managing-luma-plus). All were read through search extracts of
Luma's own pages on 2026-10-30, not fetched directly; field names were not checked on the live pages.

**Reversal cost.** Low: a webhook receiver could be added beside the pull without changing the
interface.

## Revisit when

* A customer needs registrations sooner than the weekly review, such as to change copy while an event
  is filling.
* Luma documents OAuth for third-party apps or a read-only key, so CMOkit can hold less.
* A customer's events are on another platform.
