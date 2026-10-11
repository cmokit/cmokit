# CMOkit — Vision

## Why it exists

A small business that sells a subscription needs the same machine every other one needs: a site that
brings visitors, a way to learn which page converts, a sequence that follows up with people who
signed up but did not buy, a checkout with a trial, and a record of which channel and which page
produced revenue. Each part exists as a bought tool. Wiring them together is where the money and the
months go, and the result is usually a page builder nobody can experiment in, analytics nobody reads,
and a spreadsheet joining ad spend to revenue that is out of date the week after it is built.

CMOkit is that machine, assembled once, opinionated, and open source. A business installs it into a
static site it owns, configures the tools it buys, and gets a loop that runs from the first visit to
the paid subscription and back to the next version of the page.

## What it is

* **An engine, not a site.** A business's site is its content: copy, design, pages, offers. CMOkit is
  the dependency that serves it, experiments on it, measures it and hands its visitors onward. A site
  upgrades CMOkit the way it upgrades any other dependency.
* **Build little, buy the rest.** The site is static and lives in git, where an agent edits it as
  easily as a person. There is one small server part. Experimentation, analytics, messaging and
  payment are bought, because each carries statistical, deliverability, regulatory or card risk that
  is not worth owning.
* **The loop is closed by an agent.** Every week, an agent reads what converted and what it earned,
  and proposes the next variants as a change to the site's repository. A person approves the change.
* **From visit to revenue.** The funnel does not stop at a captured email. It runs through the trial,
  the first charge, failed payments, cancellation and coming back, so every dollar is attributed to
  the channel and the page that produced it.
* **Found by agents as well as people.** More and more, a coding agent chooses a dependency for the
  developer it works for. CMOkit, and every product built with it, is written to be found, chosen and
  used correctly by those agents: readable by them, installable by them, and measured on how well
  they use it.
* **Paid for by an entity, used by people.** The payer is a business or a person, with members who
  use the product. Usage, including the credits that pay for a product's inference, is counted per
  person and accounted to the entity that pays.
* **Inside the product's audit boundary.** The part of CMOkit that holds credentials and state runs
  inside the product's existing audit boundary, on infrastructure the product already runs. Only the
  stateless edge in front of the site runs outside it.
* **The product is someone else's.** The business's product is reached through its own published API.
  CMOkit asks the product for a few general things — let this entity in, pause it, suspend it, resume
  it — and learns from it only how much each member used.

## What it is not

* A page builder, a CMS, or a hosted service. There is nothing to sign up for.
* A data warehouse or a BI tool. Revenue and conversion are read where the bought tools already put
  them.
* An ad platform or a bidding tool.
* A billing system of record. The payment processor is that.

## Who it is for

A founder or a small team selling a subscription product, comfortable with a git repository and an
agent, who would rather spend a week on their offer than a quarter on their funnel.
