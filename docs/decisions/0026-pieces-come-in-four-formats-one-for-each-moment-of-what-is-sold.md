---
status: "draft"
kind: "requirement-driven"
date: 2026-10-30
decision-makers: [Geoff]
---

# ADR-0026: Pieces come in four formats, one for each moment of what is sold

**Requirements served:** `CNT-10`, `CNT-13`, `CNT-15`, `CNT-19`.

## Context and Problem Statement

Every piece is one of a small, fixed set of formats (`CNT-13`). Content is planned backwards from
what is sold, with a small evergreen reserve when nothing is (`CNT-10`), real people and real footage
are the default (`CNT-15`), and results are read per piece, per format and per audience (`CNT-19`).
How many formats there are decides how fast results teach anything: every format multiplies the
cells results are spread across. At five pieces a week for two audiences, four formats make eight
cells, each with about two or three pieces a month; eight formats make sixteen, each with one.

## Decision Drivers

* Every moment in the life of something sold has a format.
* There is always something true to post when nothing is on sale.
* Results per format and audience accumulate fast enough to learn from each month.
* No format needs an invented person, testimonial or result (`CNT-15`).

## Considered Options

* Four formats: teaser, spotlight, recap and community question
* Three formats: teaser, spotlight and recap
* A larger library, such as tutorial, behind the scenes, myth-busting, trend and day in the life
  besides these
* No fixed formats: the skill chooses a shape for each piece

## Decision Outcome

Chosen option: "Four formats: teaser, spotlight, recap and community question", because they cover
before, during, after and between, and are few enough that each format and audience gathers results
every month.

> A **teaser** announces something before it is on sale, or as it opens. A **spotlight** shows one
> real detail of something on sale: a speaker, a feature, the room, the price. A **recap** shows,
> with real footage, something that happened, and is the only format that carries what people said,
> with their consent noted. A **community question** asks the audience something real, and its
> answers feed the audiences' own words; it is the evergreen reserve when nothing is on sale. The
> weekly plan chooses formats from where each thing sold is in its life, and the format is recorded
> on every piece. Other shapes, such as a tutorial or a behind-the-scenes, are made as one of the four.

### Consequences

* Good, because every week has an obvious plan: what is coming gets teasers, what is on sale gets
  spotlights, what happened gets recaps, and the gaps get questions.
* Good, because comparisons by format reach a few pieces per cell within a month.
* Bad, because a creator who thinks in trends or series has to fit them into a format.

### Confirmation

The server refuses a piece whose format is not one of the four. Evals assert that the plan for a week
with nothing to sell holds only community questions, within the evergreen reserve.

## Pros and Cons of the Options

### Four formats: teaser, spotlight, recap and community question

* Good, because it meets every driver.
* Bad, because four names are a vocabulary the person has to learn.

### Three formats: teaser, spotlight and recap

* Good, because results gather faster still.
* Bad, because a week with nothing on sale has nothing to post, and nothing asks the audience for the
  words its description depends on.

### A larger library, such as tutorial, behind the scenes, myth-busting, trend and day in the life besides these

* Good, because creators recognise these shapes from their feeds.
* Bad, because at eight or more formats each format and audience sees about one piece a month, too
  few to learn from, and most of them are a spotlight or a recap told another way.

### No fixed formats: the skill chooses a shape for each piece

* Good, because each piece can take whatever shape suits it.
* Bad, because results cannot be compared by format at all, and plans drift towards whatever the
  model writes most easily.

## More Information

**Reversal cost.** Low: a format is a name on each piece and a section of the skill; adding one later
keeps every result already recorded.

## Revisit when

* A customer posts so much that cells fill within a week, so more formats would still learn.
* Results show one format never converts for any audience across a quarter.
