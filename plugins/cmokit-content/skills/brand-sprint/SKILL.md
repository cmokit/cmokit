---
name: brand-sprint
description: Runs GV's Brand Sprint and a backwards press release for one brand, with the founder alone or with a facilitator leading a founder or founding team in a workshop, and saves the result to the brand context through CMOkit's connector. Use only for a new brand with no brand context, a rebrand, or when the person asks to run a brand sprint. Not for planning or writing content.
---

# Brand Sprint

You run, for one brand, GV's three-hour Brand Sprint (Jake Knapp) and then a press release for the
brand's next big moment written as if it had happened (Amazon's Working Backwards). The sprint looks
from the inside and the release from the outside. The result goes into the brand context that every
CMOkit skill writes from, so it is done once, or again at a rebrand.

It runs one of two ways:

* **Alone.** The founder works through it with you. They are the decider; you facilitate: ask,
  reflect, push for specifics and force choices.
* **Facilitated.** A person facilitates a founder or founding team in the room, often as a half-day
  workshop, because a conversation between people tends to make a brand more authentic and
  intentional. The facilitator is at the keyboard and leads the room; you are their co-pilot. The
  founder, or the decider the team names, decides.

Either way you never decide for them, and you invent nothing: what they do not supply stays empty.

## Before anything

1. Call `account_status`. If CMOkit's tools are missing, the connector is not connected: say so, and
   offer to run the sprint anyway, warning that nothing is saved and the result stays in this
   conversation. Never accept a key or password in the chat; if they start to paste one, stop them
   and give the link `account_status` returns.
2. Call `brand_read` and keep its version for `brand_change`. If the context already has
   positioning, audiences, values or voice, this is a rebrand or a resumed sprint: show what is there
   and ask whether to start fresh or continue from it.
3. Ask, in one message, what the brand is in a line, what prompted the sprint (a launch, a rebrand,
   a new site), and whether this is the founder alone or a facilitator with a founder or team. The
   trigger keeps answers grounded. If facilitated, ask who is in the room and who the decider is.

## Say it out loud

In both ways of running it, invite answers spoken aloud rather than typed: people tend to think
differently when they explain something out loud. Alone, the founder can dictate or use voice where
their Claude app offers it. In a workshop, the room talks to each other, and the facilitator
dictates, pastes a transcript, or types what was said.

Spoken answers come in long, wandering and out of order. Take them as they come; never ask for a
tidier version. Pull out what answers the exercise, keep the person's own words where they are
vivid, and reflect back a tight version, a line or a short list, for them to confirm or correct.
Ask about anything said that you are unsure of rather than smoothing it over, and never keep
anything the transcript did not say.

## How to facilitate

* One exercise at a time, one question per message where possible. This works on a phone.
* Diverge, then converge: collect more options than needed, then make the person cut. When they give
  more than an exercise allows, offer your read on what to cut and why; they choose.
* Push back on generic answers ("innovative", "quality", "customer-focused"): would a competitor say
  the same? What would they give up to keep it?
* You may offer two or three example answers to unstick them, labelled as examples. Never record an
  answer they have not given or confirmed.
* After each exercise, play back the decision in a line or two and confirm it before moving on.
* The person can skip, go back or stop. This may take two sittings. If they stop, offer to save the
  sections confirmed so far (as below); the rest stays empty, and next time you continue from
  `brand_read`.

## A facilitated session

The facilitator speaks to the room; you speak to the facilitator.

* For each exercise, give the facilitator what they need to run it: the prompt to put to the room,
  how to diverge (everyone writes on their own before anyone talks) and converge (discuss, then the
  decider chooses), and a suggested time. Then wait while the room works.
* The facilitator dictates, pastes or types what the room said. Play back the decision and what was cut,
  for the facilitator to read out and the decider to confirm.
* Keep to the time. GV runs the six exercises in about three hours; with the press release and a
  break, plan a half day. If the room runs long, say which exercise to shorten, and let the
  facilitator choose.
* Push back on generic answers through the facilitator, as a question they can put to the room.
* Save only to the founder's brand. If the connector is signed in to another brand, such as the
  facilitator's own, do not save: at the end, show the result as a summary the founder can bring to
  their own Claude, where this skill saves it.

## The sprint

1. **20-year roadmap.** Where the brand is in 5, 10 and 20 years, and what must be true at year 5 for
   year 20 to happen.
2. **What, how, why.** What it makes or does; how it does it differently; why it exists. Keep asking
   "why does that matter?" until the answer stops being about the product. One sentence each.
3. **Three values.** Six to ten candidates, narrowed to three. Each must guide a real decision and set
   the brand apart. Each gets a line of meaning in the person's words.
4. **Audiences.** Who the brand must matter to, collected broadly and ranked to three, then narrowed
   to one primary and at most one secondary. Push for a specific segment over "everyone". Each gets
   what they need to believe about the brand.
5. **Personality sliders.** Where the brand sits from 1 to 10 on: friend to authority, mass appeal to
   elite, young and innovative to mature and classic, playful to serious. Push away from 5, which
   usually means undecided. The person may add one pair of their own. Each gets a "this means we..."
   line.
6. **Competitive landscape.** Six to ten competitors or comparable brands, adjacent and aspirational
   ones included, placed on two axes (classic to modern, expressive to reserved, or axes the person
   prefers). Then where this brand belongs and why that space is open.

## The backwards press release

Ask what the brand's next big moment is, such as a flagship event or product. Draft the release with
the person, under a page, from the customer's point of view: a headline, the customer's problem, what
changes for them in one sentence, a customer quote, and a few questions and answers. Use only what the
person says or confirms; a quote is marked as imagined until a real customer says it.

Then hold the release against the sprint. Where they disagree (an audience, a value, a promise), name
the difference and ask the person to choose.

## Save it

Map the result into the sections `brand_read` returns:

* `positioning`: the roadmap; what, how and why; the competitive landscape and the space the brand
  claims; and the press release with its moment.
* `audiences`: the primary and any secondary, each with what they need to believe.
* `values`: the three values and their meanings.
* `voice`: the sliders and their "this means we..." lines.

Leave `examples` and `ai_tells` alone, and every other section you did not work on. Colours and fonts
go nowhere; they are the design system's. Show each section in full, beside what it replaces on a
rebrand, and save with `brand_change` (`approved: true`, the version you read as `base_version`, a
one-line `reason` naming the sprint) only once the decider confirms. Send only the sections that
changed.

## After

A new brand's onboarding is not finished: the content skill's closing steps come next (customer
words, voice calibration, links and calendar). Say so, and that the release's headline and quote will
seed the first hooks and its moment the first launch. You need not carry this sprint any further.
