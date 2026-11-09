# Deployment reference

Everything a deployment supplies to CMOkit, beyond the reviewed configuration in `cmokit.config.ts`.
Secrets are set in the deploying environment's own secret store, such as a GitHub repository's
secrets, and are never committed.

## The edge Worker

| Name | Kind | Required | What it is |
|---|---|---|---|
| `CMOKIT_ORIGIN` | Worker variable | No | Where the site is fetched from. Leave it unset when the Worker is routed on the site's own domain. |
| `LIFECYCLE` | Service binding | When the site sends messages or sells a subscription | The site's lifecycle Worker, which the edge passes leads, unsubscribes, SendGrid's events and Stripe's events to. |

## The lifecycle Worker

| Name | Kind | Required | What it is |
|---|---|---|---|
| `LEADS` | Durable Object binding | Yes | Each lead's place in its sequence, in an object of its own. |
| `SENDGRID_API_KEY` | Worker secret | To send messages | A SendGrid API key with Mail Send and Suppressions access. Until it is set, no lead is captured. |
| `SENDGRID_WEBHOOK_KEY` | Worker variable | To read SendGrid's events | The verification key of SendGrid's signed event webhook, which is public. Until it is set, the events are refused. |
| `STRIPE_SECRET_KEY` | Worker secret | To sell a subscription | A Stripe restricted key that can write Checkout Sessions and customer portal sessions and read subscriptions. Until it and `PRODUCT` are set, there is no checkout. |
| `STRIPE_WEBHOOK_SECRET` | Worker secret | To sell a subscription | The signing secret of the Stripe webhook endpoint. Until it is set, Stripe's events are refused. |
| `PRODUCT` | Service binding | To sell a subscription | The product's Worker, at its `Access` entrypoint, which gives and revokes a customer's access. For hosted CMOkit, the content server's Worker. |

SendGrid's event webhook posts to `https://<the site's domain>/_cmokit/leads/events`, with signing
turned on and the delivered, open, click, bounce, dropped, spam report, unsubscribe and group
unsubscribe events selected.

A product that sells a subscription names its Stripe price and trial in `cmokit.config.ts`, as
`subscription: { trialDays, stripe: { price } }`; the price is made in Stripe. Stripe's webhook posts
to `https://<the site's domain>/_cmokit/subscriptions/events`, with the
`customer.subscription.created`, `.updated`, `.deleted`, `.paused` and `.resumed` events selected.
The customer portal is turned on in Stripe's settings.

## The content server Worker

The hosted content service runs it on CMOkit's own account; a self-hoster deploys the same Worker
from `@cmokit/content`.

| Name | Kind | Required | What it is |
|---|---|---|---|
| `CUSTOMERS` | Durable Object binding | Yes | Each customer's records, in an object of its own, named by the slug in the customer's address. |
| `ISSUER_URL` | Worker variable | Yes | The issuer's address, named in the server's Protected Resource Metadata. |
| `AUDIENCE` | Worker variable | Yes | The audience the issuer issues the content server's tokens for, the server's own `https://<host>/mcp`. A token for any other audience is refused. |
| `ISSUER` | Service binding | Yes | The issuer's Worker, which checks each token and knows each person's customers. |
| `LIFECYCLE` | Service binding | To sell a subscription | The lifecycle Worker that makes checkout and portal links. Without it, a person with no customer is told to ask whoever runs it to add them. |
| `CREDENTIAL_KEY` | Worker secret | Yes | 32 random bytes, as base64, that seal every customer's credentials, such as an event calendar's key. Rotating it means re-sealing each stored credential, which nothing does yet, so until then a new key means asking each customer to connect again. |

A customer's credentials are not among these: each is entered by the customer on a one-time page of
the content server and kept sealed in that customer's object.

## The issuer Worker

The hosted service runs it beside the content server; a self-hoster deploys the same Worker from
`@cmokit/issuer`. It needs the compatibility flag `global_fetch_strictly_public`, which the OAuth
library requires to fetch a client's metadata document. Each sign-in provider's app sends people
back to `<ISSUER_URL>/callback`; a provider whose two values are not set is not offered.

| Name | Kind | Required | What it is |
|---|---|---|---|
| `OAUTH_KV` | KV namespace | Yes | The OAuth library's grants, codes and hashed tokens. No code of CMOkit's reads or writes it. |
| `IDENTITIES` | Durable Object binding | Yes | Each way in (an email address or a provider's account) and the person it belongs to, its pending code and its send limit, in an object of its own. |
| `PEOPLE` | Durable Object binding | Yes | Each person's ways in and customers, in an object of its own. |
| `ISSUER_URL` | Worker variable | Yes | The issuer's own address. |
| `AUDIENCE` | Worker variable | Yes | The content server's `AUDIENCE`, the one audience the issuer issues tokens for. |
| `SENDGRID_API_KEY` | Worker secret | For email codes | A SendGrid key with Mail Send access. |
| `MAIL_FROM` | Worker variable | For email codes | The address codes come from, verified with SendGrid. |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Variable, secret | For Google | A Google OAuth client. |
| `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` | Variable, secret | For GitHub | A GitHub OAuth app. |
| `META_APP_ID`, `META_APP_SECRET` | Variable, secret | For Meta | A Meta app with Facebook Login. |

## The deploy

| Name | Kind | Required | What it is |
|---|---|---|---|
| `CLOUDFLARE_ACCOUNT_ID` | Variable | Yes | The Cloudflare account the Workers deploy to. |
| `CLOUDFLARE_API_TOKEN` | Secret | Yes | A Cloudflare API token from the "Edit Cloudflare Workers" template. |
| `SENDGRID_API_KEY` | Secret | To send messages | Deployed as the lifecycle Worker's secret of the same name. |
| `SENDGRID_WEBHOOK_KEY` | Variable | To read SendGrid's events | Deployed as the lifecycle Worker's variable of the same name. |
| `POSTHOG_PERSONAL_API_KEY` | Secret | To sync experiments | A PostHog personal API key scoped to the project, with `experiment:write`, `feature_flag:write`, `query:read` and `experiment_saved_metric:read`. Read only by the `cmokit` command and its MCP server, never by the edge. |

The `cmokit experiments` commands also need `analytics.posthog.project` in `cmokit.config.ts`: the project's
id, which is not a secret.
