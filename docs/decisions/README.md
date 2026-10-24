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
