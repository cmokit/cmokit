---
status: "proposed"
kind: "requirement-driven"
date: 2026-11-13
decision-makers: [Geoff]
---

# ADR-0049: The cards Claude shows are MCP Apps, written in React and built into one page each

**Requirements served:** `LEAD-04`, `HST-17`.

## Context and Problem Statement

The content server's tools answer in text (ADR-0029). For the waitlist (`LEAD-04`, ADR-0043) that is
the wrong surface: a brand's user scans a ranked list, sorts and filters it, and activates or
declines people one at a time, today only on the account page (`HST-17`, ADR-0041). Most of that
work is ongoing, while the rest of the account page is one-time setup, and the person already works
in Claude.

The MCP Apps extension lets a tool name a `ui://` resource that the host renders beside the tool's
result, in a sandboxed frame that talks to the host by postMessage. Claude supports it on the web,
on the desktop and on iOS and Android, and ChatGPT implements the same standard. A card is one HTML
page the server serves, so whatever writes it needs a build step that ADR-0007's TypeScript, run by
stripping types, does not have. The question is what the cards are written in and how they reach the
server.

## Decision Drivers

* A card works in every host that implements MCP Apps, from one page the server serves.
* The cards and the account page can share one way of building interfaces as both grow.
* The protocol's own helpers, accessible components and a theme from CMOkit's own look (ADR-0046).
* Claude, which writes nearly all of CMOkit's code, writes the framework reliably.
* The content server's handlers stay web-standard and tested on Node (ADR-0003, ADR-0007).

## Considered Options

* React, built by Vite into one self-contained page per card, handed to the server by its adapter
* Svelte, built the same way
* Solid, built the same way
* Plain HTML and script, written by hand like the account page

## Decision Outcome

Chosen option: "React, built by Vite into one self-contained page per card, handed to the server by
its adapter", because it is the only framework with the MCP Apps SDK's own helpers and OpenAI's UI
kit, with the official shadcn components, and with the strongest evidence that Claude writes it
reliably. Svelte and Solid are smaller and faster, but in a card the SDK itself outweighs the
difference, and the host can load a card before the tool is called.

> Each card's source is `packages/content/apps/<card>/`, in React and TSX, styled with Tailwind
> from CMOkit's own look in `apps/theme.css`, with shadcn's components in `apps/ui/`. It talks to the
> host through `@modelcontextprotocol/ext-apps`. The content package's build runs Vite after `tsc`
> and writes each card to `dist/apps/<card>.html`, one page with its script and styles inlined. The
> card's TSX is the one place in the repository that Node does not run by stripping types; logic a
> test needs lives beside it in plain `.ts`. The content server takes the built pages as `apps`, as
> it takes the fonts; hosted CMOkit's adapter bundles them as text. With a page, a tool that has a
> card names it in `_meta.ui.resourceUri`, the server lists it under `resources/list` and serves it
> at `resources/read` as `text/html;profile=mcp-app`, with the look's two fonts loaded from the
> server's own origin, the only source its policy names. Without one, the tools answer in text alone.
> A card changes records only by calling the server's own tools, which answer with what changed.
> A card follows Claude's design guidelines for MCP Apps: inline it fits its content with no scrolling
> of its own, at most a handful of items, at most two buttons and visible controls in place of menus,
> and a list longer than that opens full screen from the card's own button, by `requestDisplayMode`.
> A host that offers no full screen, or refuses it, shows the full view in place. Backgrounds, text,
> borders and the body font are the host's style variables, with CMOkit's look as the accent, the
> heading font and the fallback where a host sends none.

### Consequences

* Good, because the waitlist is worked on where the person already is, on a phone too.
* Good, because the protocol's helpers and shadcn's components are used as they are published.
* Good, because a self-hosted deployment that passes no pages gets the same tools in text.
* Bad, because a card is about 520 KB, 144 KB gzipped, most of it the SDK and its schema library.
* Bad, because the repository now has a build step for source Node cannot run, and React and Vite
  to keep current.

### Confirmation

`packages/content/test/server.test.ts`: with a card built, the waitlist tools name it, the server
lists and serves it with the fonts from its own origin, and without one nothing changes.
`packages/content/test/waitlist-card.test.ts`: the card's filters, sorts and search, and its theme
matching the look's tokens in light and dark. `npm run check:hosted` bundles the card into the
hosted Worker.

## Pros and Cons of the Options

### React, built by Vite into one self-contained page per card, handed to the server by its adapter

* Good, because it meets every driver.
* Bad, because its runtime is the largest of the three, and the slowest in js-framework-benchmark.

### Svelte, built the same way

* Good, because its card is about a fifth of React's before the SDK, and it is faster.
* Bad, because the SDK has no Svelte helpers, shadcn-svelte is a community port, and the published
  evidence on how well Claude writes it is weaker.

### Solid, built the same way

* Good, because it is the smallest and fastest of the three.
* Bad, because version 2.0 is still in release candidates, its component library is before 1.0, and
  its shadcn ports are split, which the second and third drivers rule out.

### Plain HTML and script, written by hand like the account page

* Good, because nothing is added to build or keep current.
* Bad, because a list that sorts, filters, expands and calls tools is a small application, and
  writing each one by hand leaves the cards and the account page nothing to share.

## More Information

**Follow-on obligations.** The account page moves to React as well, with React Router on Workers,
in its own pull request and record. The dismissable notice and the copy block are shared from
`apps/ui/`.

**Reversal cost.** Moderate: a card is one page behind one address, so replacing a framework
replaces the cards' source and nothing in the server.

## Revisit when

* The SDK's own weight shrinks, so a smaller framework would make a card markedly lighter.
* A host stops supporting MCP Apps, or supports them differently.
* Many cards show in one conversation, and their size becomes what people notice.
