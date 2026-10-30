---
status: "draft"
kind: "requirement-driven"
date: 2026-10-30
decision-makers: [Geoff]
---

# ADR-0028: Editing footage and posting stay with the person's own tools, and CMOkit records what was posted

**Requirements served:** `CNT-16`, `CNT-17`, `CNT-18`, `CNT-22`.

## Context and Problem Statement

Nothing is posted without a person's approval, nothing is posted automatically and no direct message
is automated (`CNT-16`). Each approved piece is handed off in a form the person's own editing and
posting tools take, and what was posted, where and when, is recorded so its results can be attributed
(`CNT-17`). Music rights and AI disclosure are reminders, not CMOkit's to enforce (`CNT-18`).

Posting through the platforms' APIs is gated. On Instagram, publishing needs
`instagram_business_content_publish` (or `instagram_content_publish`) with Advanced Access, which
needs App Review and, for accounts the app does not own, Business Verification, and only professional
accounts can be published to. On TikTok, "all content posted by unaudited clients will be restricted
to private viewing mode" until the client passes an audit, and an unaudited client can let up to five
users post in a day. Music for businesses is limited on both: TikTok's Commercial Music Library and
Meta's Sound Collection are what a business account may use, and both platforms ask for AI-generated
content to be labelled when posting.

## Decision Drivers

* A person approves and posts every piece (`CNT-16`).
* The hand-off works with whatever app the person films, edits and posts in.
* Music, labels and disclosures are chosen where the platform offers them, at posting.
* No platform's review or audit stands between CMOkit and its first customer.

## Considered Options

* A hand-off the person takes to their own apps; the person tells Claude when it is posted, and
  CMOkit records it
* CMOkit posts through the platforms' APIs after the person approves
* CMOkit hands pieces to a scheduling tool through its API
* The person's own scheduler or editor connector, used by their Claude directly, with CMOkit brokering
  nothing

## Decision Outcome

Chosen option: "A hand-off the person takes to their own apps; the person tells Claude when it is
posted, and CMOkit records it", because it keeps posting with the person, needs no platform's review,
and works with any app.

> An approved piece is handed off as one card: hook, timed beats, on-screen text, caption with its call
> to action, shot list, its visuals, its tracked link and where to put it (ADR-0031), and the light
> check's reminders (ADR-0033). The person films, edits and posts in their own apps, choosing music,
> labels and disclosures there. When they say it is posted, with its link or time, the skill records
> the post on the piece. A person whose Claude already has a scheduling or editing connector of their
> own may ask Claude to pass the card to it; CMOkit is not part of that. CMOkit never posts, schedules
> or sends a direct message.

### Consequences

* Good, because no platform's review, audit or policy change can stop the content plugin.
* Good, because music and AI labels are chosen in the platform's own tools, which know what the
  account may use.
* Bad, because a piece is recorded as posted only if the person says so, so some results arrive
  unattributed.
* Neutral, because a person who wants scheduling brings their own scheduler.

### Confirmation

Enforced by review: CMOkit has no adapter that posts to a social platform or sends a direct message,
and its server has no tool that does.

## Pros and Cons of the Options

### A hand-off the person takes to their own apps; the person tells Claude when it is posted, and CMOkit records it

* Good, because it meets every driver.
* Bad, because recording a post is one more step for the person.

### CMOkit posts through the platforms' APIs after the person approves

* Good, because posting and its record would be one step, and nothing would go unrecorded.
* Bad, because Instagram's publishing needs App Review and Business Verification, and TikTok's
  unaudited clients post privately, so nothing posts publicly until both reviews pass.
* Bad, because CMOkit would then answer for each platform's rules on music, labels and disclosure,
  which the person's own app presents at the moment of posting.

### CMOkit hands pieces to a scheduling tool through its API

* Good, because the person sees the week laid out in a familiar calendar.
* Bad, because it picks one scheduling vendor for everyone and puts CMOkit between the person and it.

### The person's own scheduler or editor connector, used by their Claude directly, with CMOkit brokering nothing

* Good, because a person who has one gets scheduling for free.
* Bad, because as the only path it would leave out everyone without one; it is kept as an addition
  to the chosen option.

## More Information

Sources: Meta's [Instagram Platform overview](https://developers.facebook.com/docs/instagram-platform/overview/)
and [content publishing](https://developers.facebook.com/docs/instagram-platform/content-publishing/);
TikTok's [Direct Post reference](https://developers.tiktok.com/doc/content-posting-api-reference-direct-post)
and [content sharing guidelines](https://developers.tiktok.com/doc/content-sharing-guidelines);
TikTok's [Commercial Music Library](https://ads.tiktok.com/help/article/commercial-music-library?lang=en)
and [AI-generated content](https://support.tiktok.com/en/using-tiktok/creating-videos/ai-generated-content);
Meta's [Sound Collection](https://www.facebook.com/sound) and
[labelling of AI content](https://transparency.meta.com/governance/tracking-impact/labeling-ai-content/).
All were read through search extracts of the vendors' own pages on 2026-10-30, not fetched directly.

**Reversal cost.** Low: a posting adapter could be added later behind an interface without changing
the hand-off.

## Revisit when

* Most pieces go unrecorded as posted, so attribution suffers.
* A platform lets an app post publicly for its users without a review CMOkit cannot pass.
