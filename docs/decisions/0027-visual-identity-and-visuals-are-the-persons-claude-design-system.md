---
status: "draft"
kind: "requirement-driven"
date: 2026-10-30
decision-makers: [Geoff]
---

# ADR-0027: Visual identity lives in the person's Claude Design design system, and visuals are made in Claude Design from it

**Requirements served:** `CNT-14`, `CNT-15`, `CNT-22`, `HST-09`.

## Context and Problem Statement

Each piece comes with the visuals it needs, such as a cover frame or a text card, made in the brand's
own visual identity (`CNT-14`). Real footage is the default, so visuals frame footage rather than
replace it (`CNT-15`). The person works on the web and on a phone (`CNT-22`), and CMOkit runs no model
(`HST-09`). Something has to hold the brand's colours, type and components, and something has to make
visuals from them.

What Claude offers, from Anthropic's documentation: Claude Design, a template inside Claude, makes
designs from any conversation; on iOS and Android, a person asks for a design in any conversation and
views and edits it in the Artifacts tab. A design system is built from uploaded files, logos, fonts,
Figma files, decks, a codebase or connected apps; "each design system becomes an artifact Claude can
use in any chat", and a published design system is used by new projects in place of the default.
Design systems are in beta on Pro, Max, Team and Enterprise. Designs export as PDF, PPTX, standalone
HTML, a zip, or to Canva and other tools. Presets for 9:16 cover frames and a PNG export from chat
were not found in its documentation.

## Decision Drivers

* Visual identity is kept in one place the person already owns and edits.
* Visuals are made where the person already works, on the web and on a phone (`CNT-22`).
* CMOkit stores no visual identity and renders nothing.
* Visuals frame real footage, and no person or scene is generated (`CNT-15`).

## Considered Options

* The design system in the person's Claude Design holds the identity; the skill asks Claude Design for
  each visual
* CMOkit stores the brand's colours and fonts and renders templated visuals on its server
* A design tool the person already uses outside Claude, such as Canva, with a brand kit there
* Generated images and video for every piece

## Decision Outcome

Chosen option: "The design system in the person's Claude Design holds the identity; the skill asks
Claude Design for each visual", because it keeps identity and visuals in the person's own Claude,
where they already work, with nothing for CMOkit to store or render.

> The brand's visual identity is the person's own Claude Design design system, published as their
> default. CMOkit stores none of it. For each piece, the skill describes the visuals it needs (size,
> text, which footage it frames) and asks Claude Design for them in the conversation, using that
> design system. The person exports them for their editing app, or sends them to Canva or another tool
> Claude Design supports. If the person has no design system, setup offers to make one from their
> site, logo and fonts; until it exists, the skill writes each piece without visuals and says why.

### Consequences

* Good, because the person edits their identity in one place, and every visual follows it.
* Good, because CMOkit has nothing visual to store, render or keep in step.
* Bad, because visuals need a plan with design systems, in beta, and not on Free.
* Bad, because whether Claude Design produces 9:16 frames and image files an editing app accepts is
  not documented, and has to be tried.
* Neutral, because a visual made on a phone is asked for and checked back later, not drawn live.

### Confirmation

Enforced by review: the server's storage holds no colour, font or image of a brand (ADR-0030).

## Pros and Cons of the Options

### The design system in the person's Claude Design holds the identity; the skill asks Claude Design for each visual

* Good, because it meets every driver.
* Bad, because it depends on a feature in beta, on plans the person may not have.

### CMOkit stores the brand's colours and fonts and renders templated visuals on its server

* Good, because exact sizes and PNG files would be guaranteed, on any Claude plan.
* Bad, because CMOkit would store visual identity and build a renderer and templates, which is a
  design tool of its own.

### A design tool the person already uses outside Claude, such as Canva, with a brand kit there

* Good, because many creators already keep their brand in one.
* Bad, because the person's Claude would need that tool's connector to make anything, and the identity
  would sit outside the conversation where pieces are written. Claude Design's export to Canva keeps
  this path open for those who finish there.

### Generated images and video for every piece

* Good, because a piece would need no filming.
* Bad, because real people and footage are the default, and generated people or scenes are what
  `CNT-15` and the platforms' AI-labelling rules make costly. Anthropic's connector directory also
  does not list connectors that generate images, video or audio.

## More Information

Sources: Anthropic's [Claude Design](https://support.claude.com/en/articles/14604416-get-started-with-claude-design),
[design systems](https://support.claude.com/en/articles/14604397-set-up-your-design-system-in-claude-design),
[move to Claude](https://support.claude.com/en/articles/17440474-move-from-standalone-claude-design-to-claude),
[artifacts](https://support.claude.com/en/articles/17153992-what-are-artifacts-and-how-do-i-use-them)
and [connector review criteria](https://claude.com/docs/connectors/building/review-criteria), read on
2026-10-30.

**Reversal cost.** Low: CMOkit holds nothing visual, so a different tool changes the skill's text.

## Revisit when

* Trying it shows Claude Design cannot make 9:16 frames or export images an editing app accepts.
* Design systems leave beta on terms that exclude the plans solo creators use.
