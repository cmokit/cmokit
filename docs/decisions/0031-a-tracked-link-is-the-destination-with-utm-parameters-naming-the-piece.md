---
status: "draft"
kind: "requirement-driven"
date: 2026-10-30
decision-makers: [Geoff]
---

# ADR-0031: A tracked link is the destination's own URL with UTM parameters naming the piece, so content needs none of the engine

**Requirements served:** `CNT-11`, `CNT-12`, `CNT-19`, `CNT-21`, `MSR-01`, `MSR-04`.

## Context and Problem Statement

A piece has one destination and one tracked link, which differs only by the platform it is posted on
(`CNT-12`). Results are read per piece, format and audience (`CNT-19`). Content works with none of
CMOkit's experiment features configured, and where CMOkit's measurement is present a piece's link
joins it (`CNT-21`). For an event, the conversion is a registration on the event platform (`CNT-11`).

Where measurement is present, the edge records the UTM parameters and ad click ids a page was
requested with on each exposure, so a visit's channel reaches analytics even when the browser's script
is blocked (`MSR-01`), under the visitor's one identity (`MSR-04`). Luma records `utm_source`, `utm_medium`, `utm_campaign`, `utm_term`, `utm_content` and ad
click ids on each registration made through a link that carries them, and returns them on the guest
in its API as `attribution_params`.

On short-form platforms a viewer follows a link where the platform makes one followable, chiefly the
profile's link. That a link in an organic Reel's or TikTok's caption is not clickable is reported by
third parties; it was not confirmed on Instagram's or TikTok's own help pages. When several pieces
share one profile link, a click is attributed to whichever piece's link the profile carried then.

## Decision Drivers

* No part of the engine is needed to attribute a piece (`CNT-21`).
* Where the engine is present, a piece is a channel like any other (`MSR-01`).
* The destination's own records attribute its conversions, with no copy kept by CMOkit.
* Built the same way every time, never typed by a model.
* Nothing to host for a link to work.

## Considered Options

* The destination's own URL with UTM parameters naming the platform, the offer and the piece, built by
  the server
* A short link of CMOkit's per piece, redirecting to the destination
* A promo code per piece
* Attribution per offer only, with no piece in the link

## Decision Outcome

Chosen option: "The destination's own URL with UTM parameters naming the platform, the offer and the
piece, built by the server", because the destination already records them, the engine already reads
them, and nothing has to be hosted for them to work.

> When a piece is saved with its destination, the content server returns its tracked link for each
> platform: the destination's URL with `utm_source` set to the platform, `utm_medium` set to `social`,
> `utm_campaign` set to the offer and `utm_content` set to the piece's id. The hand-off says where to
> put it: in the profile's link while the piece is the newest, or in any link the platform offers on
> the post itself. A registration on an event platform is attributed to a piece by its `utm_content`
> (ADR-0032). A visit to a site behind a self-hosted engine's edge records the same parameters, so
> that site's own analytics attributes the piece like any other channel. Where neither holds, a
> piece's results are the numbers the person reports from the social platform. The piece's id joins
> each result to its format and audience.

### Consequences

* Good, because an event's registrations are attributed to pieces on day one, with or without the
  engine.
* Good, because the same link joins the engine's measurement when the edge is added later.
* Bad, because a shared profile link credits the piece it carried at the time, so older pieces that
  sent people there are undercounted.
* Bad, because a destination that drops query parameters, or a viewer who types the address, loses
  the piece.
* Bad, because a destination that is neither an event platform nor behind the engine counts no
  conversions per piece, so its pieces learn from the platform's own numbers alone.

### Confirmation

Tests assert the server builds the same link for the same piece every time, with the four parameters
and nothing else changed in the destination's URL.

## Pros and Cons of the Options

### The destination's own URL with UTM parameters naming the platform, the offer and the piece, built by the server

* Good, because it meets every driver.
* Bad, because attribution through a shared profile link is approximate.

### A short link of CMOkit's per piece, redirecting to the destination

* Good, because it counts clicks, survives destinations that drop parameters, and a stable profile
  link could redirect to whichever piece is current.
* Bad, because CMOkit would serve every visitor's first request, and a short link is one more
  domain for viewers to trust. It is premature until the profile link's approximation is shown to
  matter.

### A promo code per piece

* Good, because a code spoken on screen attributes even without a link.
* Bad, because Luma's documented API was not found to create coupons, and a code changes the price,
  which is the offer's decision, not the content's.

### Attribution per offer only, with no piece in the link

* Good, because one link per offer is simplest for the person.
* Bad, because results per piece, format and audience (`CNT-19`) would be impossible, and the brand
  context would learn nothing from results.

## More Information

Sources: Luma's [event referrals](https://help.luma.com/p/event-referrals), read through search
extracts on 2026-10-30; the edge's channel parameters in `packages/edge/src/index.ts`. Instagram's and
TikTok's own help pages on profile links could not be read.

**Reversal cost.** Low: a link is built in one place, and a redirect could wrap it later.

## Revisit when

* Most attributed conversions arrive through a profile link shared by several pieces, so a stable
  redirect that points at the current piece would attribute better.
* A platform makes links in organic posts clickable for the person's account.
* A destination the customers use drops UTM parameters.
