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
| The product itself | CMOkit reaches a product only through that product's published API. |

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

## Measurement — `MSR-`

| Id | Requirement | Priority | Status |
|---|---|---|---|
| **MSR-01** | Every visit records its channel and its variant. | Must | Proposed |
| **MSR-02** | A funnel has one conversion event until its volume shows it needs more. | Must | Proposed |
| **MSR-03** | The conversion event is also recorded server-side, so a blocked script does not lose it. | Must | Proposed |
| **MSR-04** | One identity follows a person from the first visit through conversion, trial, payment and cancellation, so revenue is attributed to the channel and variant that produced it. | Must | Proposed |
| **MSR-05** | Cost of acquisition and lifetime value by channel and variant are readable in one place without a warehouse. | Must | Proposed |

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
| **SUB-04** | A subscription that ends unpaid, or is canceled and reaches the end of its period, pauses the customer in the product; paying again resumes them. | Must | Proposed |
| **SUB-05** | Plans, prices, trial length and the grace given to a failed payment are configuration, not code. | Must | Proposed |
| **SUB-06** | Every event from the payment processor is verified before it is acted on, and acting on it twice has the effect of acting once. | Must | Proposed |
| **SUB-07** | Lifecycle events — trial started, converted, payment failed, canceled, resumed — reach analytics and messaging. | Must | Proposed |

## Product connection — `PRD-`

| Id | Requirement | Priority | Status |
|---|---|---|---|
| **PRD-01** | A new subscriber is signed in to the product through the product's own identity provider, by a standard protocol. | Must | Proposed |
| **PRD-02** | What CMOkit asks of the product at each lifecycle event is configuration: which call, to which address. No code specific to one product lives in CMOkit. | Must | Proposed |
| **PRD-03** | CMOkit authenticates to the product as a client, holding only the privileges its calls need. | Must | Proposed |
| **PRD-04** | A product that is unreachable delays a lifecycle action; it does not lose it. | Must | Proposed |

## The loop — `LOOP-`

| Id | Requirement | Priority | Status |
|---|---|---|---|
| **LOOP-01** | An agent reads conversion and revenue by channel and variant on a schedule, and proposes the next variants as a change to the site's repository. | Must | Proposed |
| **LOOP-02** | No proposed variant reaches visitors until a person approves the change. | Must | Proposed |

## Non-functional — `NFR-`

| Id | Requirement | Priority | Status |
|---|---|---|---|
| **NFR-01** | A site adopts CMOkit by adding a dependency and configuration, and upgrades by changing a version. | Must | Proposed |
| **NFR-02** | The server part runs where the deploying business chooses, including inside its product's own cloud boundary. | Must | Proposed |
| **NFR-03** | Every bought tool sits behind an interface, so a business can use another vendor for the same job. | Should | Proposed |
| **NFR-04** | A business can run CMOkit's whole test suite with no account at any bought tool. | Must | Proposed |
| **NFR-05** | Every secret is supplied by the deploying environment, never committed and never logged. | Must | Proposed |
