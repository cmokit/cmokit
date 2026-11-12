---
status: "proposed"
kind: "requirement-driven"
date: 2026-11-12
decision-makers: [Geoff]
---

# ADR-0046: CMOkit's own pages share one stylesheet from its design system, and serve their fonts themselves

**Requirements served:** `HST-17`, `HST-01`, `HST-11`.

## Context and Problem Statement

A person meets CMOkit on two sets of pages: the issuer's sign-in pages at `auth.cmokit.ai`
(ADR-0018) and the content server's pages, the account page at `app.cmokit.ai` among them
(ADR-0041, `HST-17`). Each set has a small inline stylesheet of its own, in the system font, black
and white, and the two look like different products. Most people arrive on a phone, from the
Instagram app. CMO Kit's design system, kept in Claude Design and rendered for CMOkit's own site in
`cmokit-site`, gives the colors, type, spacing and components these pages should wear.

The pages are CMOkit's own product, not an adopter's site, so their look belongs in this repository
(ADR-0002 keeps adopters' design out of it). The question is where the one look lives, and how the
pages get their two fonts while their content security policy stays tight.

## Decision Drivers

* Every page a person sees looks like one product, on a phone first, in light and dark.
* No page loads anything from a third party, and the policy names only the page's own origin.
* Anyone who deploys the packages gets the same pages (`HST-11`), and the hosted offering needs no
  step of the customer's own (`HST-01`).
* No new package, since a first publish needs a step at Geoff's laptop.

## Considered Options

* One stylesheet in the issuer package, inlined in every page, with the fonts served by each Worker
  from its own origin
* A new package for the look
* A stylesheet and fonts served from CMOkit's site
* Fonts from Google Fonts

## Decision Outcome

Chosen option: "One stylesheet in the issuer package, inlined in every page, with the fonts served
by each Worker from its own origin", because it is the only option that meets every driver.

> `@cmokit/issuer/look` exports the stylesheet, the app header with the CMO Kit wordmark, and
> `fontResponse`. Both the issuer's pages and the content server's pages put the stylesheet in
> their one `<style>` and the header at the top of their body, and nothing else in a page sets a
> color, a font or a size. The stylesheet styles plain markup: headings, text, links, fields,
> buttons (quiet by default, `primary` for the step a page asks for), notices (`role="status"`) and
> problems (`role="alert"` or `.problem`), in the design system's tokens, light and dark. The
> content server depends on the issuer package for it. Each Worker serves Schibsted Grotesk and
> Instrument Sans at `/fonts/display.woff2` and `/fonts/body.woff2` when its adapter passes them in;
> hosted CMOkit's adapters bundle them as data from the Fontsource packages, under the SIL Open Font
> License. Without them a page uses the system font. Both pages' policies add `font-src 'self'`.

### Consequences

* Good, because the sign-in pages and the account page look like one product, and a change to the
  look is one change.
* Good, because a page makes no request to anyone but its own origin.
* Good, because a self-hosted deployment gets the same pages, and the fonts when its adapter passes
  them.
* Bad, because every page carries the stylesheet inline, about 6 KB, instead of a cached file.
* Bad, because the content server now depends on the issuer package for something that is not
  sign-in.

### Confirmation

`packages/issuer/test/look.test.ts`: each font is served as woff2 and cached, nothing else answers at
those paths, and the sign-in pages carry the look and load fonts only from their own origin.
`packages/content/test/pages.test.ts`: the content server's pages carry the same look under the same
policy, with no element styled on its own. `packages/content/test/worker.test.ts`: the Worker serves
the fonts ahead of every other route. `npm run check:hosted` bundles the fonts into both Workers.

## Pros and Cons of the Options

### One stylesheet in the issuer package, inlined in every page, with the fonts served by each Worker from its own origin

* Good, because it meets every driver.
* Bad, because the stylesheet is not cached between pages.

### A new package for the look

* Good, because neither server would depend on the other.
* Bad, because its first publish needs a step at Geoff's laptop, which the fourth driver rules out.

### A stylesheet and fonts served from CMOkit's site

* Good, because the site already has them.
* Bad, because every page would load from another origin, and a self-hosted deployment would load
  CMOkit's site, which the second and third drivers rule out.

### Fonts from Google Fonts

* Good, because nothing is bundled.
* Bad, because every page would tell a third party who opened it, which the second driver rules out.

## More Information

**Follow-on obligations.** The portal's own components (steps, cards, the brand switcher) as the
onboarding pages need them. A cached stylesheet file if pages grow.

**Reversal cost.** Low: the look is one module, and each page's markup is unchanged.

## Revisit when

* The design system changes its tokens or fonts.
* The inline stylesheet grows past what a page should carry.
