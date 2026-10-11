# CMOkit — Requirements

Each requirement carries a stable id. Ids are never reused. Decision records cite these ids; these
requirements cite no decision record.

## Out of scope

| Topic | Boundary |
|---|---|
| Hosting a site | CMOkit is installed into a site its owner hosts. It runs no service for anyone. |
| A page builder or CMS | Pages are files in the site's repository, edited by a person or an agent. |
| A warehouse or BI layer | Conversion and revenue are read in the analytics tool they already land in. |
| Ad buying and bidding | Spend is an input to cost of acquisition, not something CMOkit manages. |
| Billing records | The payment processor is the system of record for charges, invoices and subscriptions. |
| The product itself | CMOkit reaches a product through its published API and its identity provider, and receives from it only usage. |
| Software with no hosted part | A skill or tool that runs entirely on a customer's machine cannot be paused. CMOkit gates only what a product hosts. |

## Serving — `SRV-`

| Id | Requirement | Priority | Status |
|---|---|---|---|
| **SRV-01** | A site built with CMOkit is static, kept in a git repository, and deployed on every push without a person acting. | Must | Proposed |
| **SRV-02** | Page copy and offers are data in the site, so a new variant is a content change rather than a code change. | Must | Proposed |
| **SRV-03** | A visitor sees their assigned variant on first paint, with no flash of another. | Must | Proposed |
| **SRV-04** | A site works, showing its default variant, when every bought tool is unreachable. | Must | Proposed |

## Experiments — `EXP-`

| Id | Requirement | Priority | Status |
|---|---|---|---|
| **EXP-01** | A visitor is assigned a variant once and keeps it across visits. | Must | Proposed |
| **EXP-02** | Whether a variant wins is decided by the experimentation tool's statistics, not by CMOkit. | Must | Proposed |
| **EXP-03** | A variant can be retired by a content change alone. | Should | Proposed |
| **EXP-04** | Visits by agents are labeled as such and kept out of experiment results. | Must | Proposed |

## Measurement — `MSR-`

| Id | Requirement | Priority | Status |
|---|---|---|---|
| **MSR-01** | Every visit records its channel and its variant. | Must | Proposed |
| **MSR-02** | A funnel has one conversion event until its volume shows it needs more. | Must | Proposed |
| **MSR-03** | The conversion event is also recorded server-side, so a blocked script does not lose it. | Must | Proposed |
| **MSR-04** | One identity follows a person from the first visit through conversion, trial, payment and cancellation, so revenue is attributed to the channel and variant that produced it. | Must | Proposed |
| **MSR-05** | Cost of acquisition and lifetime value by channel and variant are readable in one place without a warehouse. | Must | Proposed |
| **MSR-06** | A person whose first contact is outside the site — a registry or marketplace listing, an install inside an agent — is attributed to that channel at their first step through a page CMOkit serves, such as authorization consent or checkout. | Must | Proposed |
| **MSR-07** | Margin by channel and variant — revenue less usage at a configured cost per unit — is readable in one place without a warehouse. | Must | Proposed |

## Leads — `LEAD-`

| Id | Requirement | Priority | Status |
|---|---|---|---|
| **LEAD-01** | A captured lead reaches the messaging tool with its channel and variant without a person acting. | Must | Proposed |
| **LEAD-02** | No secret that can write to a bought tool is ever sent to a browser. | Must | Proposed |
| **LEAD-03** | A lead is told what will be sent to them and can stop it in one step. | Must | Proposed |

## Subscriptions — `SUB-`

| Id | Requirement | Priority | Status |
|---|---|---|---|
| **SUB-01** | A person starts a trial by choosing a plan and giving a payment method, in one hosted step of the payment processor's. | Must | Proposed |
| **SUB-02** | A trial converts to paid without the person acting, after a reminder before the first charge. | Must | Proposed |
| **SUB-03** | A payer manages their payment method, invoices and cancellation themselves, without contacting anyone. | Must | Proposed |
| **SUB-04** | A subscription that ends unpaid, or is canceled and reaches the end of its period, pauses the entity in the product; paying again resumes it. | Must | Proposed |
| **SUB-05** | Plans, prices, trial length and the grace given to a failed payment are configuration, not code. | Must | Proposed |
| **SUB-06** | Every event from the payment processor is verified before it is acted on, and acting on it twice has the effect of acting once. | Must | Proposed |
| **SUB-07** | Lifecycle events — trial started, converted, payment failed, canceled, resumed — reach analytics and messaging. | Must | Proposed |

## Entities — `ENT-`

| Id | Requirement | Priority | Status |
|---|---|---|---|
| **ENT-01** | A billable entity is the payer: one customer at the payment processor, with one or more members. A person may be a member of several entities. A product without organizations has entities of one member. | Must | Proposed |
| **ENT-02** | Every subscription, credit grant, balance, pause and suspension belongs to an entity. | Must | Proposed |
| **ENT-03** | An entity is created at its first checkout, with the person who paid as its first member. | Must | Proposed |
| **ENT-04** | Revenue from an entity is attributed to the channel and variant of the person who converted it. A member who joins later is attributed to the invitation that brought them. | Must | Proposed |
| **ENT-05** | Billing and balance messages go to an entity's billing contacts. Product messages go to its members. | Must | Proposed |

## Credits — `CRD-`

| Id | Requirement | Priority | Status |
|---|---|---|---|
| **CRD-01** | A product reports usage as signed events, each naming the member, the entity billed, a quantity and an idempotency key, and rolled up over a period rather than sent per call. | Must | Proposed |
| **CRD-02** | The credits granted by each plan, top-up pack and trial, and the rules for their rollover and expiry, are configuration. | Must | Proposed |
| **CRD-03** | An entity whose credits run out is suspended in the product; a grant that restores its balance resumes it. | Must | Proposed |
| **CRD-04** | The usage allowed between an entity's credits running out and its suspension is configuration. | Must | Proposed |
| **CRD-05** | A balance falling below a configured threshold reaches analytics and the entity's billing contacts. | Must | Proposed |
| **CRD-06** | Usage is readable per member and per entity. | Must | Proposed |
| **CRD-07** | A member can buy more credits from inside an agent session, through a link the product returns that carries their attribution. | Must | Proposed |
| **CRD-08** | An entity's pooled credits can carry a cap per member, as configuration. | Should | Proposed |

## Product connection — `PRD-`

| Id | Requirement | Priority | Status |
|---|---|---|---|
| **PRD-01** | A new member is given access through the product's own identity provider by a standard protocol: OpenID Connect for a person signing in, OAuth for an agent or MCP client acting for them. | Must | Proposed |
| **PRD-02** | What CMOkit asks of the product at each lifecycle event is configuration: which call, to which address. No code specific to one product lives in CMOkit. | Must | Proposed |
| **PRD-03** | CMOkit authenticates to the product as a client, holding only the privileges its calls need. | Must | Proposed |
| **PRD-04** | A product that is unreachable delays a lifecycle action; it does not lose it. | Must | Proposed |
| **PRD-05** | A pause or suspension takes effect within a configured time for agent clients holding access tokens, as well as for people signed in. Members of a paused or suspended entity can still sign in to pay or buy credits. | Must | Proposed |

## Agents — `AGT-`

| Id | Requirement | Priority | Status |
|---|---|---|---|
| **AGT-01** | Every page of a CMOkit site, and every page of CMOkit's own documentation, is also served as markdown, indexed by an `llms.txt`, with pricing as structured data. | Must | Proposed |
| **AGT-02** | CMOkit ships a skill that teaches a coding agent to use it correctly, and an MCP server, packaged together as one plugin. | Must | Proposed |
| **AGT-03** | The starter gives a product the means to ship its own skill, MCP server and plugin. | Must | Proposed |
| **AGT-04** | How correctly coding agents use a skill is measured by evals in CI, against more than one agent, and a release whose pass rate falls does not ship. | Must | Proposed |
| **AGT-05** | Installs by agents and first successful authenticated calls are funnel events, attributed to the agent client and registry where these can be told. | Must | Proposed |
| **AGT-06** | An agent can create, configure and run a CMOkit site locally with no prompts and no account at any bought tool. | Must | Proposed |

## The loop — `LOOP-`

| Id | Requirement | Priority | Status |
|---|---|---|---|
| **LOOP-01** | An agent reads conversion and revenue by channel and variant on a schedule, and proposes the next variants as a change to the site's repository. | Must | Proposed |
| **LOOP-02** | No proposed variant reaches visitors until a person approves the change. | Must | Proposed |
| **LOOP-03** | The loop also proposes changes to a skill and its MCP tool descriptions, judged by their evals. | Should | Proposed |

## Non-functional — `NFR-`

| Id | Requirement | Priority | Status |
|---|---|---|---|
| **NFR-01** | A site adopts CMOkit by adding a dependency and configuration, and upgrades by changing a version. | Must | Proposed |
| **NFR-02** | Every part of CMOkit that holds a credential or state runs inside the product's existing audit boundary, on infrastructure the product already runs. | Must | Proposed |
| **NFR-03** | Every bought tool sits behind an interface, so a business can use another vendor for the same job. | Should | Proposed |
| **NFR-04** | A business can run CMOkit's whole test suite with no account at any bought tool. | Must | Proposed |
| **NFR-05** | Every secret is supplied by the deploying environment, never committed and never logged. | Must | Proposed |
