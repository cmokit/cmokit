# A CMOkit site

A static Astro site with landing-page experiments, made with `npm create cmokit`.

## Set up

1. **PostHog.** Create a project and put its project key in `cmokit.config.ts`. Create a
   multivariate feature flag `landing` with variants `control` and `b`, and an experiment on that
   flag whose goal is the `signup` event.
2. **GitHub Pages.** Push this repository to GitHub. Under Settings → Pages, set the source to
   GitHub Actions and the custom domain to your domain. Add that domain to `public/CNAME`.
3. **Cloudflare.** Point your domain's DNS at GitHub Pages with the record proxied, and set SSL/TLS
   to Full. Set the route in `wrangler.jsonc` to your domain. Add the repository variable
   `CLOUDFLARE_ACCOUNT_ID` and the secret `CLOUDFLARE_API_TOKEN`.

A push to `main` then deploys the site and the edge.

## Work on it

```
npm install
npm run dev
```

See `CLAUDE.md` for how experiments and variants work.
