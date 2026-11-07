---
status: "proposed"
kind: "requirement-driven"
date: 2026-11-07
decision-makers: [Geoff]
---

# ADR-0024: Onboarding picks one of three paths by what the brand already has, and every path ends in the same closing steps

**Requirements served:** `CNT-01`, `CNT-02`, `CNT-03`, `CNT-04`, `CNT-05`.

## Context and Problem Statement

The brand context is bootstrapped at setup by a short, guided brand strategy exercise held in
conversation, which one person working alone completes in one or two sittings (`CNT-04`). It drafts
from what the person already has, and the person confirms it before anything is written from it.
Nothing in it is invented (`CNT-05`). It must fill every section `CNT-01` lists, and audiences
grounded in real customers' own words, one primary and at most one secondary (`CNT-02`), with
optional platform facts (`CNT-03`).

People arrive with very different material. Some have a brand book. Some have a brand that lives in
the founder's head. Some want to post this week and will come back to the rest. One fixed exercise
asks the first to repeat what their book says, and asks the third for an hour they will not give.

The candidate influences, each written for a different setting:

* **GV's three-hour Brand Sprint** (Jake Knapp, GV Library): six exercises for two to six people with
  a decider: a 20-year roadmap, what, how and why, top three values, top three audiences, personality
  sliders, and a competitive landscape.
* **Amazon's Working Backwards press release**: a release written as if the thing had already
  launched, under a page and from the customer's point of view, followed by a short FAQ.
* **The Foundation Sprint** (Knapp and Zeratsky, *Click*, 2025): a two-day workshop whose first
  morning sets the basics (customer, problem, advantage, competitors) and whose first afternoon works
  out differentiation.
* **April Dunford's positioning** (*Obviously Awesome*, 2019): competitive alternatives, unique
  attributes, value, best-fit customers and market category, in that order.
* **Jobs to be done, as switch interviews** (Bob Moesta and Chris Spiek): ask people who bought what
  pushed them from what they had, what pulled them to the new thing, and what anxiety and habit held
  them back.
* **Brand archetypes and personality scales**: twelve archetypes in Mark and Pearson's *The Hero and
  the Outlaw* (2001); five dimensions in Jennifer Aaker's "Dimensions of Brand Personality" (1997).
* **A voice exercise**: "we are, we are not" pairs, with words to use and to avoid.

## Decision Drivers

* One person, in a chat, on a phone if need be, in one or two sittings (`CNT-04`).
* Every answer is drafted from the person's own material and confirmed, never invented (`CNT-05`).
* Every section of `CNT-01` is filled, or left empty and asked about.
* Each output is something the skill can write against and check a draft against.
* A proven process, run well, is worth more than a new one CMOkit would have to prove.
* Onboarding is a reason to choose CMOkit, so it should be opinionated about how a brand is found.

## Considered Options

* Three paths, picked by what the brand already has, each ending in the same closing steps
* CMOkit's own exercise in seven short steps, drawing on the influences above
* The Brand Sprint as published, run by one person, for everyone
* A long questionnaire the person fills in
* Inferring the whole context from the site and past posts, and asking only for confirmation
* An archetype-led exercise

## Decision Outcome

Chosen option: "Three paths, picked by what the brand already has, each ending in the same closing
steps", because it asks each person only for what their material does not already hold, and runs
published processes where they fit instead of inventing one.

> Onboarding starts after the person has signed in and connected the brand's event calendar
> (ADR-0019); the skill asks only for what `account_status` says is missing. The skill then picks
> one path, says which and why, and lets the person choose another:
>
> * **A brand book.** When guidelines, a deck or a style guide exist. The person uploads it with the
>   site and logo. Claude drafts voice, values and audiences from it, and the person's Claude Design
>   system is built from the same files (ADR-0027). The skill asks only about what the book leaves
>   out, usually customers' own words and the closing steps.
> * **The Brand Sprint and a backwards press release, in tandem.** For a new brand, a rebrand, or a
>   brand that lives in the founder's head. The sprint runs as published, one question at a time, with
>   the person as decider and Claude facilitating: what, how and why; three values; three audiences,
>   narrowed to one primary and at most one secondary (`CNT-02`); personality sliders; and the
>   competitive landscape. The 20-year roadmap is offered and may be skipped. The press release is
>   written for the brand's next big moment, such as a flagship event or product: a headline, the
>   customer's problem, what changes for them in one sentence, a customer quote and a few questions
>   and answers. The sprint looks from the inside and the release from the outside, so where they
>   disagree the skill asks the person to choose. The release's headline and quote seed the first
>   hooks, and its moment becomes the first launch.
> * **A light start.** For a person who wants to post this week. They paste the site, two or three
>   posts they like and a few real comments. The result is a first, partial version, with empty
>   sections asked about as they come up, and a full path offered once the first pieces are out.
>
> Every path ends in the same closing steps:
>
> 1. **Customer words.** Real comments, messages and reviews, pasted or as screenshots. For people
>    who bought: what was happening when they started looking, what drew them, what nearly stopped
>    them, and what they would have done instead, after the switch interview.
> 2. **Voice calibration.** "We are, we are not" pairs and words to use and to avoid. Claude then
>    writes six short hooks from the draft context; the person approves or rejects each with a
>    reason, which seeds the examples. The AI tells start from the skill's default list.
> 3. **Links and calendar.** Where the profile link points, and the first sort of the calendar's past
>    and upcoming events into the things the brand promotes (ADR-0031).
>
> The person then reads the whole context and confirms it, which saves its first version through
> `brand_change` (ADR-0023). Any path can stop after any step and resume later; nothing is written
> from the context until it is confirmed. The brand context holds no colours or fonts; the look lives
> in the Claude Design system.

### Consequences

* Good, because a person with a brand book is not asked to restate it, and a person in a hurry can
  post in the first week.
* Good, because the sprint and the release are known processes, cited and run as their authors wrote
  them, so CMOkit's contribution is running them well and checking one against the other.
* Good, because audiences come from buyers' own words on every path, which also feeds the hooks.
* Bad, because three paths are three sets of prompts to write and evaluate.
* Bad, because a light start gives a thin first context, which fills in only with use (ADR-0025).
* Neutral, because the sprint path may take two sittings, which `CNT-04` now allows.

### Confirmation

Evals run each path against invented brands' materials and assert that every confirmed field traces
to the material or to the person's answer, that missing material leaves fields empty, and that the
path the skill picks fits the material it was given.

## Pros and Cons of the Options

### Three paths, picked by what the brand already has, each ending in the same closing steps

* Good, because it meets every driver.
* Bad, because the choice of path is one more thing the skill can get wrong; the person can always
  pick another.

### CMOkit's own exercise in seven short steps, drawing on the influences above

* Good, because it is one exercise to write and to evaluate.
* Bad, because it asks a person with a brand book to repeat it, and asks a person in a hurry for
  about fifty minutes before their first post.
* Bad, because it is a new exercise, untested until people use it, where proven ones exist.

### The Brand Sprint as published, run by one person, for everyone

* Good, because it is proven and widely known.
* Bad, because a brand book already answers most of it, and it is too long for a light start.
* Bad, because its three audiences are more than `CNT-02` allows, so the path narrows them.

### A long questionnaire the person fills in

* Good, because it is thorough and the same for everyone.
* Bad, because it asks the person to write what Claude could draft from their own material, and
  people abandon long forms, more so on a phone.

### Inferring the whole context from the site and past posts, and asking only for confirmation

* Good, because it takes minutes.
* Bad, because a site does not hold what stopped buyers or what the brand will never claim, so the
  draft would fill those with guesses, which `CNT-05` forbids, and a tired person confirms guesses.

### An archetype-led exercise

* Good, because twelve archetypes are quick to choose between and easy to remember.
* Bad, because a borrowed archetype yields the same voice for every brand that picks it, which is
  what the context exists to prevent; sliders and "we are, we are not" pairs say the same more
  precisely.

## More Information

Sources: Jake Knapp, [The Three-Hour Brand Sprint](https://library.gv.com/the-three-hour-brand-sprint-3ccabf4b768a),
GV Library; Jake Knapp and John Zeratsky, [Click](https://www.theclickbook.com/) (2025), and
[Introducing the Foundation Sprint](https://www.lennysnewsletter.com/p/introducing-the-foundation-sprint);
Amazon's [Working Backwards](https://www.aboutamazon.com/news/workplace/an-insider-look-at-amazons-culture-and-processes)
press release and FAQ; April Dunford, *Obviously Awesome* (2019); Bob Moesta and Chris Spiek's forces of progress,
[jobstobedone.org](https://jobstobedone.org/learn/); Margaret Mark and Carol S. Pearson, *The Hero and
the Outlaw* (2001); Jennifer L. Aaker, "Dimensions of Brand Personality", *Journal of Marketing
Research* 34 (1997). The workshops' contents were read through search extracts and summaries on
2026-10-30, not in full; Amazon's page was read on 2026-11-07.

**Follow-on obligations.** The skill's default list of AI tells, the paths' prompts and the closing
steps are content of the skill, evaluated like the rest of it. The sprint path may reuse an existing
brand sprint skill and map its cheat sheet into the brand context's sections.

**Reversal cost.** Low: the exercise is text in the skill, and a context already confirmed stays.

## Revisit when

* Most people on the sprint path stop before the closing steps.
* Most light starts never take a full path.
* Contexts made by the exercise score worse on voice fidelity than contexts written by hand for the
  same brands.
