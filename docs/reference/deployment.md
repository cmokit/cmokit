# Deployment reference

Everything a deployment supplies to CMOkit, beyond the reviewed configuration in `cmokit.config.ts`.
Secrets are set in the deploying environment's own secret store, such as a GitHub repository's
secrets, and are never committed.

## The edge Worker

| Name | Kind | Required | What it is |
|---|---|---|---|
| `CMOKIT_ORIGIN` | Worker variable | No | Where the site is fetched from. Leave it unset when the Worker is routed on the site's own domain. |

## The deploy

| Name | Kind | Required | What it is |
|---|---|---|---|
| `CLOUDFLARE_ACCOUNT_ID` | Variable | Yes | The Cloudflare account the Workers deploy to. |
| `CLOUDFLARE_API_TOKEN` | Secret | Yes | A Cloudflare API token from the "Edit Cloudflare Workers" template. |
| `POSTHOG_PERSONAL_API_KEY` | Secret | To sync experiments | A PostHog personal API key scoped to the project, with `experiment:write`, `feature_flag:write`, `query:read` and `experiment_saved_metric:read`. Read only by the `cmokit` command and its MCP server, never by the edge. |

The `cmokit experiments` commands also need `analytics.posthog.project` in `cmokit.config.ts`: the project's
id, which is not a secret.
