---
status: "proposed"
kind: "requirement-driven"
date: 2026-11-13
decision-makers: [Geoff]
---

# ADR-0051: The account page is React, rendered on the server and hydrated in the browser

**Requirements served:** `HST-17`.

## Context and Problem Statement

The account page (`HST-17`, ADR-0041) is the one place a creator sets up their brand and works their
waitlist outside Claude. It was written as HTML strings in `src/pages.ts`, while the cards Claude
shows are React (ADR-0049), which named the account page as the next to move, with React Router on
Workers. The page now needs pieces the cards share: a notice that can be dismissed and a block of
text with a copy button. Almost all of it is one-time setup, every change is a form post to a route
the server already has, and it has no client navigation or data loading of its own. The question is
how the page is written and served.

## Decision Drivers

* The page and the cards share one way of building interfaces and one set of components.
* The page works, and every form posts, before its script has loaded.
* The content server's routes, sign-in and policy stay as they are (ADR-0003, ADR-0041).
* Nothing is added that the page does not use today.

## Considered Options

* React components rendered to HTML by the server, hydrated by one script the server serves
* React Router in framework mode on Workers
* Keep the page as HTML strings

## Decision Outcome

Chosen option: "React components rendered to HTML by the server, hydrated by one script the server
serves", because it shares the cards' components and look while the routes, forms and sign-in stay
as they are. React Router would add a router and a loader layer to a page that has neither client
navigation nor data loading.

> The page's source is `packages/content/apps/portal/`, in React and TSX, with shared components in
> `apps/ui/` and the look's `apps/theme.css`. The content package's build runs Vite twice: once for
> the browser script and stylesheet, once to bundle the server's renderer with both as text, written
> to `dist/apps/portal.js`. The content server takes it as `portal`; hosted CMOkit's adapter passes
> it in. For each request the server builds the page's view, renders it with `renderToString`,
> embeds the view as JSON, and serves the script at `/portal.js`, cached for a year at its current
> version. The policy allows scripts from the server's own origin only. Forms still post to the
> server's routes, which answer with a redirect. Without a `portal`, the account page answers 503 and
> everything else is unchanged. Tests compile TSX with esbuild through a Node module hook.

### Consequences

* Good, because the notice and the copy block are one component each, for the page and the cards.
* Good, because the page reads and posts with no script, and the script only adds the copy button
  and dismissing the notice.
* Bad, because the browser loads about 82 KB gzipped of script for two small interactions.
* Bad, because the server's bundle includes React's server renderer.

### Confirmation

`packages/content/test/account.test.ts` and `instagram.test.ts`: every tab, setup step, form and
notice, rendered by the components. `packages/content/test/pages.test.ts`: the page's policy, its
view embedded with no `<`, the script's versioned address and caching. `npm run check:hosted` bundles
the page into the hosted Worker.

## Pros and Cons of the Options

### React components rendered to HTML by the server, hydrated by one script the server serves

* Good, because it meets every driver.
* Bad, because the page carries React's runtime for very little interaction.

### React Router in framework mode on Workers

* Good, because client navigation, loaders and actions come with it when the page needs them.
* Bad, because it brings its own build, routing and server entry, and the page uses none of them.

### Keep the page as HTML strings

* Good, because nothing is added.
* Bad, because the page and the cards would each write the same components their own way.

## More Information

**Reversal cost.** Low: the view the server builds is unchanged, so another renderer replaces only
`apps/portal/`.

## Revisit when

* The page needs client navigation, or loads data after it opens: then React Router.
* The script's size becomes what people notice on a phone.
