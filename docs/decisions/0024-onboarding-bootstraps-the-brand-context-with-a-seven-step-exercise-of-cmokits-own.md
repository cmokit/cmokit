---
status: "draft"
kind: "requirement-driven"
date: 2026-10-30
decision-makers: [Geoff]
---

# ADR-0024: Onboarding bootstraps the brand context with a seven-step exercise of CMOkit's own, about fifty minutes long

**Requirements served:** `CNT-01`, `CNT-02`, `CNT-03`, `CNT-04`, `CNT-05`.

## Context and Problem Statement

The brand context is bootstrapped at setup by a short, guided brand strategy exercise held in
conversation, which one person working alone completes in one sitting (`CNT-04`). It drafts from what
the person already has, and the person confirms it before anything is written from it. Nothing in it
is invented (`CNT-05`). It must fill every section `CNT-01` lists, and audiences grounded in real
customers' own words, one primary and at most one secondary (`CNT-02`), with optional platform facts
(`CNT-03`).

The candidate influences, each written for a different setting:

* **GV's three-hour Brand Sprint** (Jake Knapp, GV Library): six exercises for two to six people with
  a decider: a 20-year roadmap, what, how and why, top three values, top three audiences, personality
  sliders, and a competitive landscape.
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

* One person, in a chat, on a phone if need be, in one sitting (`CNT-04`).
* Every answer is drafted from the person's own material and confirmed, never invented (`CNT-05`).
* Every section of `CNT-01` is filled, or left empty and asked about.
* Each output is something the skill can write against and check a draft against.
* CMOkit writes its own exercises and cites its influences; it copies no published workshop.

## Considered Options

* CMOkit's own exercise in seven short steps, drawing on the influences above
* The Brand Sprint as published, run by one person
* A long questionnaire the person fills in
* Inferring the whole context from the site and past posts, and asking only for confirmation
* An archetype-led exercise

## Decision Outcome

Chosen option: "CMOkit's own exercise in seven short steps, drawing on the influences above",
because it keeps the parts of each influence a solo creator can answer from their own material in a
chat, and drops the parts that exist to align a team.

> The exercise has seven steps. At each, Claude drafts from what the person gave and the person
> corrects or confirms; what neither the material nor the person supplies is left empty.
>
> 1. **Gather** (about 5 minutes). The person shares what they have: their site, a brand book, past
>    posts they liked and did not, and real comments, messages and reviews, pasted or as screenshots.
> 2. **What and why** (about 5 minutes). What they sell, how, and why it exists, after the Brand
>    Sprint's what, how and why.
> 3. **Positioning** (about 10 minutes). What a buyer would do without them, what they have that the
>    alternatives lack, what that does for the buyer, and who cares most, after Dunford and the
>    Foundation Sprint's basics. The output is a short positioning and the list of what is sold.
> 4. **Audiences** (about 10 minutes). For people who actually bought: what was happening when they
>    started looking, what drew them, what nearly stopped them, and what they would have done
>    instead, in their own words from comments and messages, after the switch interview. One primary
>    audience and at most one secondary, each with its optional platform facts.
> 5. **Values and lines** (about 5 minutes). Three values, each with something the brand does because
>    of it, and what the brand will and will not say or claim.
> 6. **Voice** (about 10 minutes). Five sliders of CMOkit's own between opposite qualities, "we are,
>    we are not" pairs, words to use and to avoid, signature phrases and rhythm, drafted from the
>    posts the person liked.
> 7. **Examples and tells** (about 5 minutes). Claude writes six short hooks from the draft context;
>    the person approves or rejects each with a reason, which seeds the examples. The AI tells start
>    from the skill's default list, and the person adds their own and removes any they like.
>
> The person then reads the whole context and confirms it, which saves its first version. The
> exercise can stop after any step and resume later; nothing is written from the context until it
> is confirmed. The Brand Sprint's 20-year roadmap and competitive landscape, the Foundation Sprint's
> second day, and archetypes are left out.

### Consequences

* Good, because the result is concrete: values with behaviours, sliders, pairs and word lists a draft
  can be checked against.
* Good, because audiences come from buyers' own words, which also feeds the hooks.
* Bad, because a person with no past posts or customer comments gets a thin first context, which
  fills in only with use (ADR-0025).
* Neutral, because the step lengths are targets for the exercise's design, measured once people use
  it.

### Confirmation

Evals run the exercise against invented brands' materials and assert that every confirmed field
traces to the material or to the person's answer, and that missing material leaves fields empty.

## Pros and Cons of the Options

### CMOkit's own exercise in seven short steps, drawing on the influences above

* Good, because it meets every driver.
* Bad, because it is a new exercise, untested until people use it.

### The Brand Sprint as published, run by one person

* Good, because it is proven and widely known.
* Bad, because it is three hours, built for a group with a decider, and its 20-year roadmap and
  competitive landscape align a team more than they direct a week's posts.
* Bad, because its three audiences are more than `CNT-02` allows.

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
April Dunford, *Obviously Awesome* (2019); Bob Moesta and Chris Spiek's forces of progress,
[jobstobedone.org](https://jobstobedone.org/learn/); Margaret Mark and Carol S. Pearson, *The Hero and
the Outlaw* (2001); Jennifer L. Aaker, "Dimensions of Brand Personality", *Journal of Marketing
Research* 34 (1997). The workshops' contents were read through search extracts and summaries on
2026-10-30, not in full.

**Follow-on obligations.** The skill's default list of AI tells, its five sliders, and the exercise's
prompts are content of the skill, evaluated like the rest of it.

**Reversal cost.** Low: the exercise is text in the skill, and a context already confirmed stays.

## Revisit when

* Most people take more than an hour to finish, or stop before step four.
* Contexts made by the exercise score worse on voice fidelity than contexts written by hand for the
  same brands.
