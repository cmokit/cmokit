# A CMOkit site

A static Astro site with landing-page experiments and a sequence of emails to each lead, made with
`npm create cmokit`.

## Set up

1. **PostHog.** Create a project and put its project key and project id in `cmokit.config.ts`.
   Create a personal API key scoped to that project, with `experiment:write`,
   `feature_flag:write`, `query:read` and `experiment_saved_metric:read`, and add it to the
   repository as the secret `POSTHOG_PERSONAL_API_KEY`.
   Every deploy then makes PostHog's experiments match `cmokit.config.ts`: you never set one up
   in PostHog.
2. **GitHub Pages.** Push this repository to GitHub. Under Settings → Pages, set the source to
   GitHub Actions and the custom domain to your domain. Add that domain to `public/CNAME`.
3. **Cloudflare.** Point your domain's DNS at GitHub Pages with the record proxied, and set SSL/TLS
   to Full. Set the route in `wrangler.jsonc` to your domain. Add the repository variable
   `CLOUDFLARE_ACCOUNT_ID` and the secret `CLOUDFLARE_API_TOKEN`.
4. **SendGrid.** Authenticate your sending domain, create an unsubscribe group, and set
   `messaging` in `cmokit.config.ts`: the from address, your postal address and the group's id.
   Create an API key with Mail Send and Suppressions access, and add it as the secret
   `SENDGRID_API_KEY`. Under Settings → Mail Settings, turn on the event webhook, posting to
   `https://<your domain>/_cmokit/leads/events` with signing on, and add its verification key as the
   variable `SENDGRID_WEBHOOK_KEY`. Edit the emails in `messages/`.

A push to `main` then deploys the site, the lifecycle and the edge, and creates the `landing` experiment in
PostHog as a draft. To start it, change its `status` to `running` in a pull request, and merge it.
`npx cmokit experiments plan` estimates how long it must run first, and
`npx cmokit experiments results` reads how it is doing; both read the key from
`POSTHOG_PERSONAL_API_KEY` in your shell. A coding agent started in this directory finds the same
as tools of the `cmokit` MCP server in `.mcp.json`.

## Work on it

```
npm install
npm run dev
```

See `CLAUDE.md` for how experiments and variants work.
