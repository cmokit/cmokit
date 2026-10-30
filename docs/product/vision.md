# CMOkit — Vision

## Why it exists

A small business that sells a subscription needs the same machine every other one needs: a site that
brings visitors, a way to learn which page converts, a sequence that follows up with people who
signed up but did not buy, a checkout with a free trial, and a record of which channel and which page
produced revenue. Each part exists as a bought tool. Wiring them together is where the money and the
months go, and the result is usually a page builder nobody can experiment in, analytics nobody reads,
and a spreadsheet joining ad spend to revenue that is out of date the week after it is built.

CMOkit is that machine, assembled once, opinionated, and open source. A business puts it in front of
the site it already has, on whatever builds and hosts that site, configures the tools it buys, and
gets a loop that runs from the first visit to the paid subscription and back to the next version of
the page.

## What it is

* **An engine, not a site.** A business's site is its content: copy, design, pages, offers. CMOkit is
  the dependency that serves it, experiments on it, measures it and hands its visitors onward. It
  works whatever the site is built with and wherever it is hosted, and a business that runs it itself
  upgrades CMOkit the way it upgrades any other dependency.
* **Build little, buy the rest.** A variant is a page of the site, which an agent writes as easily as
  a person. CMOkit itself is a small server part. Experimentation, analytics, messaging,
  subscriptions and payment are bought, because each carries statistical, deliverability, regulatory
  or card risk that is not worth owning. A credit balance carries none, so CMOkit counts credits
  itself.
* **The loop is closed by an agent.** Every week, an agent reads what converted and what it earned,
  and proposes the next variants as a change to the site. A person approves the change.
* **From visit to revenue.** The funnel does not stop at a captured email. It runs through the free
  trial, the first charge, failed payments, cancellation and reactivation, so every dollar is
  attributed to the channel and the page that produced it.
* **Found by agents as well as people.** More and more, a coding agent chooses a dependency for the
  developer it works for. CMOkit, and every product built with it, is written to be found, chosen and
  used correctly by those agents: readable by them, installable by them, and measured on how well
  they use it.
* **The standard subscription lifecycle, with usage credits.** A customer subscribes to a plan, which
  entitles its users to the product's features and grants it credits for metered usage. Usage draws
  down the customer's credit balance; top-ups add to it. The customer's access follows its
  subscription and its balance. CMOkit uses the vocabulary every billing system already uses.
* **Costs nothing while nothing happens.** A small business's traffic is low and uneven. Every part of
  CMOkit scales to zero, so a quiet month costs what its bought tools charge and nothing more.
* **One vendor to run it.** Everything CMOkit runs and stores is on Cloudflare, which already sits in
  front of the site. There is one account to secure and one vendor to list.
* **The product is someone else's.** The business's product is reached through its own published API.
  CMOkit asks the product for a few general things — give this customer access, revoke it, restore it
  — and learns from it only how much each user used.

## Also hosted, for people who sell through what they post

CMOkit is also offered as a commercial hosted service, for content marketers and creators who post a
lot of short-form video and sell something through it: an event, an offer, a launch, a subscription.
Most of them are not developers. They work in Claude, on the web and on their phone, with no terminal
and no repository. CMOkit stays open source, and anyone can still run the engine themselves, as they
can today.

* **Very little to set up.** A customer creates a CMOkit account, connects their site and sets up
  payment. There is no terminal, no repository work and no Cloudflare account of their own.
* **Set up by talking to Claude.** The customer sets CMOkit up in a conversation in Claude, payment
  processing included.
* **Signing in is only signing in.** A CMOkit account signs in with an email address, Google, GitHub
  or Meta. Signing in identifies the person and grants nothing else; anything more, such as
  connecting a site, is asked for on its own, when it is needed.
* **Any site, still.** A site on GitHub Pages is connected through the customer's GitHub account. A
  site hosted anywhere else is connected through its host's or CMS's own API, and CMOkit publishes to
  it there.
* **Their own Claude does the thinking.** A solo creator runs CMOkit from the Claude account they
  already have, through its plugins and connectors, beside any others they use. CMOkit's hosted
  services run no inference, so what they cost is storage, compute and bought tools, which is why the
  hosted offering can cost a solo creator very little each month.
* **Content that sounds like them.** The content plugin turns what a business sells into a weekly
  batch of short videos, each with one call to action, written in the brand's own voice from a brand
  strategy the customer owns. It learns each week from what the customer edits, rejects and approves,
  and from what each piece brought in.
* **No accounting connection.** An accounting system connects to the payment processor directly, and
  CMOkit adds nothing by standing between them. CMOkit reads the payment processor for attribution
  and the subscription lifecycle, never for accounting.
* **CMOkit is its own first customer.** CMOkit's own site is built on GitHub Pages with CMOkit, and
  the short-form content that markets CMOkit to creators is made with the content plugin.

## What it is not

* A page builder or a CMS. Nor is the engine a hosted service: a business that runs the engine itself
  has nothing to sign up for.
* A data warehouse or a BI tool. Revenue and conversion are read where the bought tools already put
  them.
* An ad platform or a bidding tool.
* A billing system of record. The payment processor is that, for every subscription, invoice and
  charge; CMOkit counts only credits.

## Who it is for

The self-hosted engine is for a founder or a small team selling a subscription product, comfortable
with a git repository and an agent, who would rather spend a week on their offer than a quarter on
their funnel.

The hosted offering is for a creator or a small business that grows a paying audience through
short-form video, works in Claude rather than a terminal, and would rather spend an hour a week on
what they post than a day on how it gets made.
