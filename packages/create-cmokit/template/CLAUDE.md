# This site

An Astro site on GitHub Pages, with a CMOkit edge (a Cloudflare Worker) in front of it that runs
landing-page experiments on PostHog.

## Experiments

- `cmokit.config.ts` lists each experiment: its PostHog flag, the page under experiment (which is
  the control), a page for every other variant, its goal (a conversion event) and its status. Only
  a `running` experiment assigns visitors; a `draft` or `ended` one serves everyone the page itself.
  The configuration is bundled into the edge, so a change to it takes effect when the edge deploys.
- A variant is an ordinary page. To add one to a draft: create the page (for example
  `src/pages/variants/landing/c.astro`) and add it to the experiment's `variants` in
  `cmokit.config.ts`. A running experiment's variants, split and goal cannot change: end it and
  start a new experiment under a new flag.
- Every deploy makes PostHog match `cmokit.config.ts` (`npx cmokit experiments sync`): it creates a
  new experiment as a draft, starts it when its status becomes `running`, ends it when it becomes
  `ended`, and archives it when it is removed. Never change these experiments in PostHog; the next
  deploy refuses or overwrites the change. `npx cmokit experiments sync --dry-run` shows what a
  deploy would do.
- `npm run build` fails if a draft or running experiment's page does not exist.
- Locally, `npm run dev` serves every page at its own address: open a variant's page directly to
  see it. On the live site, a variant's own address redirects to the page under experiment; preview
  any variant there with `?cmokit_variant=<key>`.
- A form marked `data-cmokit-convert="<event>"` records that event as a conversion for the
  visitor, server-side, and gets `data-cmokit-state="done"` when it has been sent. The experiment's
  goal in PostHog is that event.
- Before starting an experiment, `npx cmokit experiments plan` estimates how long it must run, from
  the page's recent traffic and the goal's conversion rate there. `npx cmokit experiments results`
  reads each experiment's results. The `cmokit` MCP server in `.mcp.json` offers both as tools, with
  `experiments_preview_sync` to see what the next deploy would do. Which variant wins is PostHog's
  call: a variant has won when `results` calls it significant and its whole lift interval is above
  zero. All of them read `POSTHOG_PERSONAL_API_KEY` from the shell; if it is not set, ask the person
  to set it there. Never ask for the key itself.

## Messages to leads

- A form with an email field whose `data-cmokit-convert` event starts a sequence in
  `cmokit.config.ts` captures the visitor as a lead. The lead is then sent the sequence's messages
  in order, each `after` the one before, until one of its `stop` events, an unsubscribe or a
  bounce. The form says what will be sent; keep it saying so.
- Each message is `messages/<template>.md`: a `subject` in its front matter, then markdown
  (paragraphs, links, bold and italic). A new template is also added to `messages/index.ts`.
  `npm run build` fails if a sequence names a template that is missing or has no subject.
- Changing a message is a pull request, like changing a page. CMOkit adds why it was sent, the
  unsubscribe link and the postal address to every message, so a template needs none of them.
- Sends, opens, clicks and unsubscribes are PostHog events (`message_sent`, `message_opened`,
  `message_clicked`, `message_unsubscribed`, `sequence_ended`) under the visitor's id, with the
  variant and channel they came from.

## Deployment

A push to `main` builds the site, deploys it to GitHub Pages, then deploys the lifecycle Worker
(`lifecycle/wrangler.jsonc`) and the edge (`wrangler.jsonc`, whose route is the site's domain). The
lifecycle goes first, since the edge's service binding names it.
