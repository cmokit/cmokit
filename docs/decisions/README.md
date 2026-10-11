# Decision records

MADR 4.0.0 with the local rules in [ADR-0001](0001-documentation-structure.md). Start a new record
from [adr-template.md](adr-template.md).

| Record | Decision | Status |
|---|---|---|
| [0001](0001-documentation-structure.md) | Documentation structure | Proposed |
| [0002](0002-the-engine-is-a-dependency-a-site-is-content.md) | The engine is a dependency, and a site is content | Proposed |
| [0003](0003-the-server-part-runs-where-the-deployment-chooses.md) | The edge runs as a Worker, and lifecycle work as a container inside the product's boundary | Proposed |
| [0004](0004-a-product-is-reached-by-calling-its-api.md) | A product's lifecycle is reached by calling its API, not by events it sends | Proposed |
| [0005](0005-a-product-reports-usage-and-cmokit-decides-when-credits-run-out.md) | A product reports usage to CMOkit, and CMOkit decides when credits run out | Proposed |
| [0006](0006-cmokit-keeps-its-state-in-its-own-postgres-database.md) | CMOkit keeps its state in a Postgres database of its own, on the product's instance | Proposed |
| [0007](0007-typescript-on-node-for-everything.md) | TypeScript on Node for everything | Proposed |
| [0008](0008-lifecycle-ships-as-one-image-configured-by-environment.md) | Lifecycle work ships as one image, coupled to its environment by variables alone | Proposed |
