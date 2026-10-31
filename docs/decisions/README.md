# Decision records

MADR 4.0.0 with the local rules in [ADR-0001](0001-documentation-structure.md). Start a new record
from [adr-template.md](adr-template.md).

| Record | Decision | Status |
|---|---|---|
| [0001](0001-documentation-structure.md) | Documentation structure | Proposed |
| [0002](0002-the-engine-is-a-dependency-a-site-is-content.md) | The engine is a dependency, and a site is content | Proposed |
| [0003](0003-the-server-part-runs-on-cloudflare-workers.md) | The server part runs on Cloudflare Workers alone | Proposed |
| [0004](0004-a-product-is-reached-by-calling-its-api.md) | A product's lifecycle is reached by calling its API, not by events it sends | Proposed |
| [0005](0005-a-product-reports-usage-and-cmokit-acts-on-the-balance.md) | A product reports usage to CMOkit, which debits the customer's credit ledger and acts on its balance | Proposed |
| [0006](0006-credits-are-a-ledger-of-cmokits-own-on-cloudflare.md) | Credits are a ledger of CMOkit's own, in a Durable Object per customer, and all of CMOkit's storage is on Cloudflare | Proposed |
| [0007](0007-typescript-on-node-for-everything.md) | TypeScript on Node for everything | Proposed |
| [0008](0008-the-environment-reaches-the-workers-through-variables-alone.md) | The deploying environment reaches the Workers through variables and secrets alone | Proposed |
| [0009](0009-a-variant-is-a-page-the-edge-chooses.md) | A variant is a page of the site, and the edge chooses which one a visitor is served | Proposed |
| [0010](0010-experiments-and-analytics-run-on-posthog.md) | Experiments and analytics run on PostHog, behind interfaces named for each job | Proposed |
| [0011](0011-packages-publish-javascript-built-from-their-source.md) | Packages publish JavaScript built from their TypeScript, and the repository runs the source | Proposed |
| [0012](0012-money-runs-on-stripe-alone.md) | Money runs on Stripe alone, behind a payments interface | Proposed |
| [0013](0013-experiments-are-declared-in-configuration-and-synced-to-the-tool.md) | Experiments are declared in CMOkit's configuration, and the deploy makes the experiments tool match | Proposed |
| [0014](0014-lead-messages-are-sequences-of-cmokits-own.md) | A lead's messages are a sequence declared in CMOkit's configuration, kept in a Durable Object per lead | Proposed |
| [0015](0015-email-is-sent-through-sendgrid.md) | Email is sent through SendGrid, behind the messaging interface | Proposed |
| [0016](0016-the-hosted-content-service-is-one-multi-tenant-deployment-on-cmokits-own-cloudflare.md) | The hosted content service is one multi-tenant deployment, on CMOkit's own Cloudflare account | Draft |
| [0017](0017-hosted-cmokit-is-billed-and-gated-by-cmokits-own-lifecycle.md) | Hosted CMOkit is billed and gated by CMOkit's own lifecycle, and meters nothing yet | Draft |
| [0018](0018-cmokit-accounts-sign-in-through-an-issuer-of-cmokits-own.md) | CMOkit accounts sign in through an issuer of CMOkit's own, with an email code, Google, GitHub or Meta, and no password | Draft |
| [0019](0019-setup-is-a-conversation-that-hands-every-credential-to-a-page.md) | Setup is a conversation in Claude, and every credential is given on a page, never in the conversation | Draft |
| [0020](0020-the-hosted-content-service-connects-no-site.md) | The hosted content service connects no site, and a piece's destination is any URL | Draft |
| [0021](0021-the-content-workflow-is-an-agent-skill-run-in-the-persons-own-claude.md) | The content workflow and its opinions are an agent skill, run in the person's own Claude | Draft |
| [0022](0022-the-content-plugin-is-a-second-plugin-beside-the-coding-agent-plugin.md) | The content plugin is a second plugin, beside the coding-agent plugin, in the same marketplace | Draft |
| [0023](0023-the-brand-context-is-kept-by-cmokits-server-and-read-through-its-connector.md) | The brand context is kept by CMOkit's server, versioned, and read through its connector before every draft | Draft |
| [0024](0024-onboarding-bootstraps-the-brand-context-with-a-seven-step-exercise-of-cmokits-own.md) | Onboarding bootstraps the brand context with a seven-step exercise of CMOkit's own, about fifty minutes long | Draft |
| [0025](0025-learning-from-use-proposes-brand-context-changes-from-recorded-signals.md) | Learning from use records each piece's signals on CMOkit's server, and the weekly review proposes brand context changes the person approves | Draft |
| [0026](0026-pieces-come-in-four-formats-one-for-each-moment-of-what-is-sold.md) | Pieces come in four formats, one for each moment of what is sold | Draft |
| [0027](0027-visual-identity-and-visuals-are-the-persons-claude-design-system.md) | Visual identity lives in the person's Claude Design design system, and visuals are made in Claude Design from it | Draft |
| [0028](0028-editing-and-posting-stay-with-the-persons-own-tools.md) | Editing footage and posting stay with the person's own tools, and CMOkit records what was posted | Draft |
| [0029](0029-a-small-remote-mcp-server-is-the-content-plugins-connector.md) | A small remote MCP server, one address per customer, is the content plugin's connector, and checks tokens it does not issue | Draft |
| [0030](0030-the-content-server-keeps-each-customers-records-in-a-durable-object-of-its-own.md) | The content server keeps each customer's records in a Durable Object of its own, and stores nothing it can read elsewhere | Draft |
| [0031](0031-a-tracked-link-is-the-destination-with-utm-parameters-naming-the-piece.md) | A tracked link is the destination's own URL with UTM parameters naming the piece, so content needs none of the engine | Draft |
| [0032](0032-events-are-read-from-the-event-platform-luma-first-by-a-weekly-pull.md) | Events and registrations are read from the event platform behind an events interface, Luma first, by a pull when results are read | Draft |
| [0033](0033-the-light-check-runs-in-the-skill-and-never-blocks.md) | The light check runs in the skill, a script and Claude's own reading, and never blocks | Draft |
| [0034](0034-the-content-plugin-names-the-claude-settings-it-needs-and-says-when-one-is-missing.md) | The content plugin names the Claude settings it depends on, and says in plain words when one is missing | Draft |
| [0035](0035-the-issuers-tokens-are-kept-in-workers-kv-by-cloudflares-oauth-library.md) | The issuer's tokens are kept in Workers KV by Cloudflare's OAuth library, and everything else in Durable Objects | Draft |
