---
status: "draft"
kind: "requirement-driven"
date: 2026-10-30
decision-makers: [Geoff]
---

# ADR-0033: The light check runs in the skill, a script and Claude's own reading, and never blocks

**Requirements served:** `CNT-06`, `CNT-15`, `CNT-18`, `CNT-26`, `HST-09`.

## Context and Problem Statement

A light check flags health or cure claims, before-and-after claims, testimonials with no consent
noted, and reminders about music rights and AI disclosure; it never blocks and is not a compliance
review (`CNT-18`). Every draft is also checked against the brand's voice and its AI tells before the
person sees it (`CNT-06`), and nothing invents a person, a testimonial or a result (`CNT-15`). Evals
check that the light check flags what it is meant to flag (`CNT-26`).

Some of this is matching words: a listed AI tell, a phrase such as "cures" or "before and after".
Some is judgment: whether a sentence makes a health claim in other words. CMOkit's hosted services run
no model (`HST-09`), so judgment can only happen in the person's Claude. The rules the flags point at
are real: the FTC's Endorsement Guides, its rule against fake reviews and testimonials, TikTok's and
Meta's requirements to label AI-generated content and disclose paid partnerships, and their limits
on music for business accounts.

## Decision Drivers

* Flags appear with the draft, before the person sees it (`CNT-06`).
* Judgment happens in the person's own Claude, never in CMOkit (`HST-09`).
* The check never stops a piece; the person decides.
* Its word lists are versioned and evaluated with the skill (`CNT-26`).

## Considered Options

* In the skill: a script in the skill matches lists, and Claude reads the draft against the brand's
  lines and the check's categories; flags are shown, never enforced
* A tool on CMOkit's server that matches lists when a piece is saved
* Both, with the server checking again when a piece is saved
* A check that blocks a flagged piece until the person resolves it

## Decision Outcome

Chosen option: "In the skill: a script in the skill matches lists, and Claude reads the draft against
the brand's lines and the check's categories; flags are shown, never enforced", because the part that
needs judgment can only run in the person's Claude, and the part that matches words runs there too, in
the skill's own sandbox.

> The content skill carries a script, run in Claude's code sandbox, that matches each draft against
> the brand's AI tells and words to avoid and against the check's lists for health or cure claims,
> before-and-after claims and testimonials. Claude then reads the draft against the brand's lines and
> the same categories, for what the lists miss. A quote from a real person is flagged unless the
> person noted their consent when giving it, and that note is kept on the piece. Every hand-off
> carries two reminders: to use music the account may use commercially, and to label anything made
> or changed with AI as the platform asks. Flags are shown beside the draft with a plain reason. The
> person may publish anyway; nothing is blocked, and the check says it is not legal advice.

### Consequences

* Good, because the check needs nothing of CMOkit's and costs nothing to run.
* Good, because its lists sit beside the skill's text and are evaluated with it.
* Bad, because a person who ignores every flag still can; the check informs, it does not protect.
* Neutral, because a word list catches only what it lists, and Claude's reading catches more but not
  everything.

### Confirmation

Evals plant each kind of claim, AI tell and unconsented testimonial in drafts for invented brands, and
assert the check flags each and blocks none (`CNT-26`).

## Pros and Cons of the Options

### In the skill: a script in the skill matches lists, and Claude reads the draft against the brand's lines and the check's categories; flags are shown, never enforced

* Good, because it meets every driver.
* Bad, because it depends on code execution being on, as the whole skill does.

### A tool on CMOkit's server that matches lists when a piece is saved

* Good, because the lists would apply the same way however the piece was written.
* Bad, because without a model the server only matches words, and it would flag a piece after the
  person has already seen it.

### Both, with the server checking again when a piece is saved

* Good, because a piece saved without the skill would still be checked.
* Bad, because two copies of the lists drift, and the second pass adds nothing the first did not.

### A check that blocks a flagged piece until the person resolves it

* Good, because a risky claim could not slip through.
* Bad, because `CNT-18` says the check never blocks, and a word list's false alarms would stop honest
  pieces.

## More Information

Sources: the FTC's [Endorsement Guides, 16 CFR Part 255](https://www.federalregister.gov/documents/2023/07/26/2023-14795/guides-concerning-the-use-of-endorsements-and-testimonials-in-advertising)
and [rule on consumer reviews and testimonials, 16 CFR Part 465](https://www.ftc.gov/news-events/news/press-releases/2024/08/federal-trade-commission-announces-final-rule-banning-fake-reviews-testimonials);
TikTok's [branded content policy](https://www.tiktok.com/legal/page/global/bc-policy/en) and
[AI-generated content](https://support.tiktok.com/en/using-tiktok/creating-videos/ai-generated-content);
Meta's [labelling of AI content](https://transparency.meta.com/governance/tracking-impact/labeling-ai-content/)
and [music guidelines](https://www.facebook.com/legal/music_guidelines). All were read through search
extracts on 2026-10-30.

**Reversal cost.** Low: the check is text and a script in the skill.

## Revisit when

* Evals show the check missing a planted claim that a person later had to take down.
* A customer's industry needs a check its own reviewer signs off, which is beyond a light check.
