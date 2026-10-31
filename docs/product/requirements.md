# CMOkit — Requirements

Each requirement carries a stable id. Ids are never reused. Decision records cite these ids; these
requirements cite no decision record.

## Out of scope

| Topic | Boundary |
|---|---|
| Hosting a site | CMOkit sits in front of a site its owner builds and hosts. The self-hosted engine runs no service for anyone. CMOkit's hosted content service is a service, and it neither hosts nor publishes to any site. |
| A page builder or CMS | Pages are made with whatever builds the site: a static site generator, a CMS or anything else. |
| A warehouse or BI layer | Conversion and revenue are read in the analytics tool they already land in. |
| Ad buying and bidding | Spend is an input to cost of acquisition, not something CMOkit manages. A brand's audiences let a person aim their own ads at the people their content is for; CMOkit places no ad. |
| Editing and posting video | Footage is edited, and posts are published and scheduled, in the person's own tools. CMOkit posts nothing for anyone and automates no direct messages. |
| Compliance review | The content check flags claims a person may want to look at twice. It blocks nothing, gives no legal advice and is not a compliance engine. |
| Payment records | The payment processor is the system of record for subscriptions, invoices and charges. CMOkit counts credits, in the product's units, and keeps nothing about money. |
| The product itself | CMOkit reaches a product through its published API and its identity provider, and receives from it only usage. |
| Running in an adopter's own cloud | CMOkit runs on Cloudflare. An audited adopter relies on Cloudflare's own audit reports for it, and one that cannot use Cloudflare cannot use CMOkit's lifecycle. |
| Software with no hosted part | A skill or tool that runs entirely on a user's machine cannot have its access revoked. CMOkit gates only what a product hosts. |

## Serving — `SRV-`

| Id | Requirement | Priority | Status |
|---|---|---|---|
| **SRV-01** | CMOkit works in front of a site on any host, built with any static site generator or CMS, with no change to how the site is built or hosted. | Must | Proposed |
| **SRV-02** | A variant is a page of the site, so a new variant is a content change rather than a change to CMOkit. | Must | Proposed |
| **SRV-03** | A visitor sees their assigned variant on first paint, with no flash of another. | Must | Proposed |
| **SRV-04** | A site works, showing its default variant, when every bought tool is unreachable. | Must | Proposed |

## Experiments — `EXP-`

| Id | Requirement | Priority | Status |
|---|---|---|---|
| **EXP-01** | A visitor is assigned a variant once and keeps it across visits. | Must | Proposed |
| **EXP-02** | Whether a variant wins is decided by the experimentation tool's statistics, not by CMOkit. | Must | Proposed |
| **EXP-03** | A variant can be retired by a content change alone. | Should | Proposed |
| **EXP-04** | Visits by agents are labeled as such and kept out of experiment results. | Must | Proposed |
| **EXP-05** | A person or an agent plans, starts, reads and ends an experiment from CMOkit — its configuration, its command line and its MCP server — without opening the experimentation tool. | Must | Proposed |
| **EXP-06** | Starting or ending an experiment is a reviewed change to the configuration, which a person approves like any other. | Must | Proposed |

## Measurement — `MSR-`

| Id | Requirement | Priority | Status |
|---|---|---|---|
| **MSR-01** | Every visit records its channel and its variant. | Must | Proposed |
| **MSR-02** | A funnel has one conversion event until its volume shows it needs more. | Must | Proposed |
| **MSR-03** | The conversion event is also recorded server-side, so a blocked script does not lose it. | Must | Proposed |
| **MSR-04** | One identity follows a person from the first visit through conversion, free trial, payment and cancellation, so revenue is attributed to the channel and variant that produced it. | Must | Proposed |
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
| **SUB-01** | A person starts a free trial by choosing a plan and giving a payment method, in one hosted checkout step of the payment processor's. | Must | Proposed |
| **SUB-02** | A free trial converts to a paid subscription without the person acting, after a reminder before the first charge. | Must | Proposed |
| **SUB-03** | A customer manages its payment method, invoices and cancellation in a self-service customer portal, without contacting anyone. | Must | Proposed |
| **SUB-04** | A subscription that becomes unpaid after dunning, or is canceled and reaches the end of its billing period, revokes the customer's access in the product; reactivating the subscription restores it. | Must | Proposed |
| **SUB-05** | Plans, prices, entitlements, trial length and the grace period after a failed payment are configuration, not code. | Must | Proposed |
| **SUB-06** | Every webhook event from the payment processor is verified before it is acted on, and acting on it twice has the effect of acting once. | Must | Proposed |
| **SUB-07** | Lifecycle events — trial started, trial converted, payment failed, subscription canceled, subscription reactivated — reach analytics and messaging. | Must | Proposed |

## Customers and users — `CUS-`

| Id | Requirement | Priority | Status |
|---|---|---|---|
| **CUS-01** | A customer is who pays: one customer at the payment processor, with one or more users. A person may be a user of several customers. A product without organizations has customers of one user. | Must | Proposed |
| **CUS-02** | Every subscription, credit grant, credit balance and change of access belongs to a customer. | Must | Proposed |
| **CUS-03** | A customer is created at its first checkout, with the person who paid as its first user. | Must | Proposed |
| **CUS-04** | Revenue from a customer is attributed to the channel and variant of the person who converted it. A user who joins later is attributed to the invitation that brought them. | Must | Proposed |
| **CUS-05** | Billing and credit balance messages go to a customer's billing contacts. Product messages go to its users. | Must | Proposed |

## Credits — `CRD-`

| Id | Requirement | Priority | Status |
|---|---|---|---|
| **CRD-01** | A product reports usage as usage events, each naming the user, the customer, a quantity and an idempotency key, and aggregated over a short period rather than sent per call. | Must | Proposed |
| **CRD-02** | The credit grants of each plan, top-up and free trial, and the rules for their rollover and expiry, are configuration. | Must | Proposed |
| **CRD-03** | A customer whose credit balance is exhausted loses access to metered features in the product; a credit grant that restores the balance restores that access. | Must | Proposed |
| **CRD-04** | The overage allowed between a customer's credit balance being exhausted and its metered features being blocked is configuration. | Must | Proposed |
| **CRD-05** | A credit balance falling below a configured threshold reaches analytics and the customer's billing contacts. | Must | Proposed |
| **CRD-06** | Usage is readable per user and per customer. | Must | Proposed |
| **CRD-07** | A user can buy a top-up from inside an agent session, through a link the product returns that carries their attribution. | Must | Proposed |
| **CRD-08** | A customer's shared credit balance can carry a usage limit per user, as configuration. | Should | Proposed |

## Product connection — `PRD-`

| Id | Requirement | Priority | Status |
|---|---|---|---|
| **PRD-01** | A new user is given access through the product's own identity provider by a standard protocol: OpenID Connect for a person signing in, OAuth for an agent or MCP client acting for them. | Must | Proposed |
| **PRD-02** | What CMOkit asks of the product at each lifecycle event is configuration: which call, to which address. No code specific to one product lives in CMOkit. | Must | Proposed |
| **PRD-03** | CMOkit authenticates to the product as a client, holding only the privileges its calls need. | Must | Proposed |
| **PRD-04** | A product that is unreachable delays a change of access; it does not lose it. | Must | Proposed |
| **PRD-05** | Revoking a customer's access, or blocking its metered features, takes effect within a configured time for agent clients holding access tokens as well as for people signed in. Users of such a customer can still sign in to pay or buy a top-up. | Must | Proposed |

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
| **LOOP-01** | An agent reads conversion and revenue by channel and variant on a schedule, and proposes the next variants as a change to the site: a change to its repository, or drafts in its CMS. | Must | Proposed |
| **LOOP-02** | No proposed variant reaches visitors until a person approves the change. | Must | Proposed |
| **LOOP-03** | The loop also proposes changes to a skill and its MCP tool descriptions, judged by their evals. | Should | Proposed |

## Hosted offering (`HST-`)

What CMOkit's hosted content service must do, and how a customer is set up for it. The engine stays self-hosted.

| Id | Requirement | Priority | Status |
|---|---|---|---|
| **HST-01** | CMOkit's content service is offered hosted. A customer sets it up with a CMOkit account, a subscription and, if it sells through one, its event platform, and nothing more: no terminal, no repository work and no Cloudflare account of the customer's own. | Must | Proposed |
| **HST-02** | A person creates a CMOkit account and signs in to it with an email address, or with Google, GitHub or Meta. Signing in identifies the person and grants CMOkit nothing else at that provider. | Must | Proposed |
| **HST-03** | Setup is a conversation in the person's own Claude, including subscribing and connecting the event platform. | Must | Proposed |
| **HST-04** | A credential a customer gives CMOkit never passes through a conversation with a model. It is granted through the vendor's own authorization, or entered on a page of CMOkit's that the conversation links to, and it is held for that customer alone, encrypted, never logged and never shown again. | Must | Proposed |
| **HST-05** | A person's Claude reaches CMOkit on their behalf through an authorization the person grants by signing in and can revoke, never through a key the person copies. | Must | Proposed |
| **HST-08** | A solo creator runs CMOkit from the Claude account they already have, through its plugins and connectors, alongside any other plugins they use. | Must | Proposed |
| **HST-09** | CMOkit's hosted services run no model inference. Model work happens in the customer's own Claude account, so what the hosted services cost is storage, compute and bought tools. | Must | Proposed |
| **HST-10** | Each customer's data, credentials and connections are kept apart from every other customer's: nothing done for one customer reads or changes another's. A person who is a user of several customers acts for one at a time, and chooses which. | Must | Proposed |
| **HST-11** | Everything the hosted offering does, anyone can do by deploying the same open-source packages to a Cloudflare account of their own. No feature is hosted only. | Must | Proposed |
| **HST-12** | A customer subscribes to hosted CMOkit, and manages and cancels its subscription, without contacting anyone. | Must | Proposed |
| **HST-13** | A customer can export everything CMOkit holds for it, in a readable form, and close its account, which deletes what CMOkit holds. | Must | Proposed |
| **HST-14** | CMOkit is its own first customer: its own site, on GitHub Pages, is built with CMOkit, and the short-form content that markets CMOkit to creators is made with the content plugin. | Must | Proposed |

## Content (`CNT-`)

A creator or small business grows a paying audience through short-form video, Instagram Reels and
TikTok first. Two early users anchor these requirements: CMOkit marketing itself to creators, and a
small business selling paid in-person events. The person using the content plugin is not a developer,
and works in claude.ai, the Claude desktop app and the Claude mobile app.

| Id | Requirement | Priority | Status |
|---|---|---|---|
| **CNT-01** | A brand context holds the brand's positioning and what it sells; its audiences; its values, and what it will and will not say or claim; its voice and tone, with vocabulary to use and avoid, signature phrases and rhythm; approved and rejected examples; and a list of AI tells to avoid. | Must | Proposed |
| **CNT-02** | A brand has one primary audience and at most one secondary. Each records the situation its people are in, what they want, what stops them from buying, where they spend time and what they say in their own words, drawn from real customers, comments and messages, never from an invented demographic persona. | Must | Proposed |
| **CNT-03** | An audience may carry a few platform facts, so that content and any ads the person runs elsewhere aim at the same people: location and radius, a minimum age, language, and for LinkedIn only, job titles or industries. | Should | Proposed |
| **CNT-04** | The brand context is bootstrapped at setup by a short, guided brand strategy exercise held in conversation, which one person working alone completes in one sitting. It drafts from what the person already has, such as a brand book, their site and past posts, and the person confirms it before anything is written from it. | Must | Proposed |
| **CNT-05** | Nothing in the brand context is invented. What the person has neither supplied nor confirmed is left empty and asked about, not guessed. | Must | Proposed |
| **CNT-06** | The brand context is read before anything is written, and every draft is checked against the brand's voice and its list of AI tells before the person sees it. | Must | Proposed |
| **CNT-07** | Every edit the person makes to a draft, every rejection with its reason, every approval and every result is kept as a signal for the brand it belongs to. | Must | Proposed |
| **CNT-08** | Changes to the brand context are proposed from those signals, each with the signals behind it, and a change takes effect only when the person approves it. | Must | Proposed |
| **CNT-09** | The brand context belongs to the person. They can see and edit all of it at any time, see every change made to it with when and why, undo any change, and take it with them in a readable form. | Must | Proposed |
| **CNT-10** | Content is planned backwards from what is being sold. Each week's plan starts from the events, offers and launches being promoted, and with nothing to promote there is no content beyond a small evergreen reserve. | Must | Proposed |
| **CNT-11** | An event sold on an event platform is read from that platform, with its page, its date and its capacity, and is never entered a second time. A registration on the platform is the event's conversion. | Must | Proposed |
| **CNT-12** | A piece has one job, one audience, one call to action, one destination and one tracked link, which differs only by the platform the piece is posted on. | Must | Proposed |
| **CNT-13** | Every piece is one of a small, fixed set of formats: teaser, spotlight, recap and community question. | Must | Proposed |
| **CNT-14** | Each piece is written in full: its hook, timed beats, on-screen text, caption, call to action and shot list, with the visuals it needs made in the brand's own visual identity. | Must | Proposed |
| **CNT-15** | Real people and real footage are the default. Nothing written invents a person, a testimonial or a result. | Must | Proposed |
| **CNT-16** | Nothing is posted without a person's approval. Nothing is posted automatically, and no direct message is automated. | Must | Proposed |
| **CNT-17** | Each approved piece is handed off in a form the person's own editing and posting tools take, and what was posted, where and when, is recorded so that its results can be attributed. | Must | Proposed |
| **CNT-18** | A light check flags health or cure claims, before-and-after claims, testimonials with no consent noted, and reminders about music rights and AI disclosure. It never blocks, and it is not a compliance review. | Must | Proposed |
| **CNT-19** | Results are read weekly, per piece, per format and per audience, so that the audiences learn from use as the voice does. | Must | Proposed |
| **CNT-20** | An event's real capacity and remaining places can make its copy urgent, and nothing invents scarcity; its check-ins can feed its recap. | Should | Proposed |
| **CNT-21** | Content works with none of CMOkit's experiment features configured. Where CMOkit's measurement is present, a piece's tracked link joins it, so its visits and conversions are attributed like any other channel's. | Must | Proposed |
| **CNT-22** | A person plans, reviews, approves and records content, and reads its results, in claude.ai, the Claude desktop app and the Claude mobile app, with no terminal and no local files. | Must | Proposed |
| **CNT-23** | The Claude settings the content plugin depends on are listed. When one is missing, the person is told in plain words what is missing and how to turn it on, and the plugin does what it can without it. | Must | Proposed |
| **CNT-24** | How well the content skill writes in a brand's voice is measured by evals in CI, on invented brands: how closely its drafts match the brand's approved examples, and how many of the brand's AI tells they carry. A release whose scores fall does not ship. | Must | Proposed |
| **CNT-25** | An eval plays a series of a person's edits through learning from use, and shows the brand context improving: the changes proposed match the pattern of the edits, and drafts written after they are approved need fewer edits. | Must | Proposed |
| **CNT-26** | Evals also check the content opinions: one call to action per piece, no invented person, testimonial or result, and the light check flagging what it is meant to flag. | Should | Proposed |

## Non-functional — `NFR-`

| Id | Requirement | Priority | Status |
|---|---|---|---|
| **NFR-01** | A site adopts CMOkit by adding a dependency and configuration, and upgrades by changing a version. | Must | Proposed |
| **NFR-03** | Every bought tool sits behind an interface, so a business can use another vendor for the same job. | Should | Proposed |
| **NFR-04** | A business can run CMOkit's whole test suite with no account at any bought tool. | Must | Proposed |
| **NFR-05** | Every secret CMOkit's own deployment runs with is supplied by the deploying environment, never committed and never logged. A credential a customer gives CMOkit, such as an event platform's key, is not one of these: it is held as `HST-04` requires. | Must | Proposed |
| **NFR-06** | Every part of CMOkit scales to zero: with no traffic and no events it runs nothing and costs nothing beyond its bought tools' own charges. | Must | Proposed |
