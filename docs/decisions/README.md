# Decision records

MADR 4.0.0 with the local rules in [ADR-0001](0001-documentation-structure.md). Start a new record
from [adr-template.md](adr-template.md).

| Record | Decision | Status |
|---|---|---|
| [0001](0001-documentation-structure.md) | Documentation structure | Proposed |
| [0002](0002-the-engine-is-a-dependency-a-site-is-content.md) | The engine is a dependency, and a site is content | Proposed |
| [0003](0003-the-server-part-runs-on-workers-and-can-run-in-a-container.md) | The server part runs as Cloudflare Workers, and lifecycle work can run as a container inside an audited product's boundary | Proposed |
| [0004](0004-a-product-is-reached-by-calling-its-api.md) | A product's lifecycle is reached by calling its API, not by events it sends | Proposed |
| [0005](0005-a-product-reports-usage-and-cmokit-acts-on-the-balance.md) | A product reports usage to CMOkit, which records it at the billing tool and acts on the tool's balance events | Proposed |
| [0006](0006-credit-balances-are-the-billing-tools-and-cmokit-keeps-no-database.md) | Credit balances are kept by the billing tool, and CMOkit keeps no database | Proposed |
| [0007](0007-typescript-on-node-for-everything.md) | TypeScript on Node for everything | Proposed |
| [0008](0008-lifecycle-is-configured-by-environment-variables-alone.md) | Lifecycle work is configured by environment variables alone, and its container is one image the deployment builds | Proposed |
| [0009](0009-a-variant-is-a-page-the-edge-chooses.md) | A variant is a page of the site, and the edge chooses which one a visitor is served | Proposed |
| [0010](0010-experiments-and-analytics-run-on-posthog.md) | Experiments and analytics run on PostHog, behind interfaces named for each job | Proposed |
| [0011](0011-packages-publish-javascript-built-from-their-source.md) | Packages publish JavaScript built from their TypeScript, and the repository runs the source | Proposed |
| [0012](0012-billing-runs-on-autumn-over-stripe.md) | Billing runs on Autumn over Stripe, behind an interface named for the job | Proposed |
