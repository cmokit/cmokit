# This site

An Astro site on GitHub Pages, with a CMOkit edge (a Cloudflare Worker) in front of it that runs
landing-page experiments on PostHog.

## Experiments

- `cmokit.config.ts` lists each experiment: its PostHog flag, the page under experiment (which is
  the control), a page for every other variant, its goal (a conversion event) and its status. Only
  a `running` experiment assigns visitors; a `draft` or `ended` one serves everyone the page itself.
  The configuration is bundled into the edge, so a change to it takes effect when the edge deploys.
- A variant is an ordinary page. To add one: create the page (for example
  `src/pages/variants/landing/c.astro`), add it to the experiment's `variants` in
  `cmokit.config.ts`, and add the same variant key to the flag in PostHog. To retire one, remove it
  from the flag in PostHog first, then from the config and the pages.
- `npm run build` fails if a draft or running experiment's page does not exist.
- Locally, `npm run dev` serves every page at its own address: open a variant's page directly to
  see it. On the live site, a variant's own address redirects to the page under experiment; preview
  any variant there with `?cmokit_variant=<key>`.
- A form marked `data-cmokit-convert="<event>"` records that event as a conversion for the
  visitor, server-side, and gets `data-cmokit-state="done"` when it has been sent. The experiment's
  goal in PostHog is that event.
- Which variant wins is PostHog's call, read from the experiment's results.

## Deployment

A push to `main` builds the site, deploys it to GitHub Pages, and deploys the edge with
`wrangler deploy`. The Worker's route is in `wrangler.jsonc`.
