---
status: "draft"
kind: "requirement-driven"
date: 2026-10-30
decision-makers: [Geoff]
---

# ADR-0020: A site is connected through a publishing interface, with GitHub Pages, through a GitHub App, its only adapter at first

**Requirements served:** `HST-06`, `HST-07`, `SRV-01`, `NFR-03`, `LOOP-02`, `CNT-12`.

## Context and Problem Statement

A hosted customer connects its site separately from signing in, and CMOkit publishes to it only what
a person approved, in a way that can be undone (`HST-06`, `HST-07`, `LOOP-02`). A site on GitHub
Pages is connected through the customer's GitHub account; a site anywhere else, through its host's or
CMS's own API (`HST-06`, `SRV-01`), behind an interface named for the job (`NFR-03`).

Content does not need a connected site: a piece's destination is any URL, such as an event's page on
its event platform (`CNT-12`). A site is connected when the customer wants CMOkit to publish a page
to it, such as an offer's landing page.

What publishing takes differs by host. On GitHub, it is a commit. A GitHub App asks for fixed,
fine-grained permissions and is installed on the repositories the person selects; committing needs
Contents (write), opening a pull request needs Pull requests (write), reading the Pages site needs
Pages (read), and editing `.github/workflows` needs Workflows (write), a permission of its own. An
OAuth App's `repo` scope instead reaches every repository the person can. Elsewhere, Webflow,
WordPress.com, Shopify and Netlify offer OAuth and an API that publishes, each differently: Webflow's
publishes CMS items, not new static pages; self-hosted WordPress, Ghost and Framer issue keys or
application passwords instead of OAuth; Squarespace has no page API; and Carrd, Linktree, Stan Store
and Beacons have no public API at all.

GitHub's own limits page says GitHub Pages "is not intended for or allowed to be used as a free
web-hosting service to run your online business, e-commerce site, or any other website that is
primarily directed at either facilitating commercial transactions or providing commercial software
as a service (SaaS)."

## Decision Drivers

* CMOkit can do in the repository only what publishing needs (`HST-06`).
* Nothing reaches visitors until a person approves it, and anything published can be taken back
  (`HST-07`, `LOOP-02`).
* Hosts sit behind one interface, so the next host is an adapter (`NFR-03`).
* No adapter is built before a customer needs it.

## Considered Options

* A publishing interface, with one adapter at first: GitHub, through a GitHub App on selected
  repositories, publishing by pull request
* GitHub through an OAuth App with the `repo` scope
* GitHub plus the hosts with OAuth publishing APIs (Webflow, WordPress.com, Shopify) from the start
* No site connection: pieces point only at pages that already exist

## Decision Outcome

Chosen option: "A publishing interface, with one adapter at first: GitHub, through a GitHub App on
selected repositories, publishing by pull request", because it gives CMOkit the least access that can
publish, leaves a reviewable record of every publish, and builds no adapter before a customer needs
it.

> The publishing interface takes a set of files the person's Claude wrote and the person approved,
> publishes them to the connected site, and undoes a publish. Its GitHub adapter is a GitHub App the
> person installs on the site's repository alone, asking for Contents (write), Pull requests (write),
> Pages (read) and read access to the checks that gate a merge. It never asks for Workflows or
> Administration, so it cannot change how the site is built or who can reach it. A publish is a
> branch and a pull request, which CMOkit merges once the site's checks pass; undoing it is a revert,
> merged the same way. The adapter publishes to sites built with a builder CMOkit has an integration
> for, Astro first, and says so when it is connected to any other. The app's sign-in is not CMOkit's
> sign-in (ADR-0018). Any other host gets an adapter when a customer on it needs to publish.

### Consequences

* Good, because CMOkit can touch only the repository the person chose, and cannot edit its workflows.
* Good, because every publish and every undo is a pull request in the customer's own history.
* Bad, because a publish waits for the site's build, minutes rather than seconds.
* Bad, because a customer whose site is on another host cannot publish through CMOkit until its
  adapter exists, though its content works.
* Neutral, because whether a customer's site is the kind GitHub Pages allows is between the customer
  and GitHub; CMOkit hosts no site and shows GitHub's limits when a site is connected.

### Confirmation

Tests run the GitHub adapter against recorded GitHub responses and assert the permissions it asks
for, that a publish is a pull request merged only after its checks pass, and that an undo reverts it.
The boundary check fails the build if a handler names GitHub; only the adapter does.

## Pros and Cons of the Options

### A publishing interface, with one adapter at first: GitHub, through a GitHub App on selected repositories, publishing by pull request

* Good, because it meets every driver.
* Bad, because the first customer on another host waits for an adapter.

### GitHub through an OAuth App with the `repo` scope

* Good, because an OAuth App is simpler to register, and its token does not expire after eight hours.
* Bad, because `repo` reaches every repository the person can reach, far more than one site needs.

### GitHub plus the hosts with OAuth publishing APIs (Webflow, WordPress.com, Shopify) from the start

* Good, because more creators could publish on the first day.
* Bad, because no early customer is known to be on them, and each publishes in its own shape (CMS
  items, posts, pages), so each is real work. It is premature.

### No site connection: pieces point only at pages that already exist

* Good, because neither early user needs a connected site to make content, and it builds nothing.
* Bad, because `HST-06` and `HST-07` ask for it, and a creator selling an offer with no page of its
  own has nowhere to send a call to action.

## More Information

Sources: GitHub's [choosing permissions for a GitHub App](https://docs.github.com/en/apps/creating-github-apps/registering-a-github-app/choosing-permissions-for-a-github-app),
[pulls API](https://docs.github.com/en/rest/pulls/pulls), [Pages API](https://docs.github.com/en/rest/pages/pages),
[installing a third-party app](https://docs.github.com/en/apps/using-github-apps/installing-a-github-app-from-a-third-party),
[differences between GitHub Apps and OAuth Apps](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/differences-between-github-apps-and-oauth-apps)
and [GitHub Pages limits](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits);
Webflow's [publish](https://developers.webflow.com/data/reference/sites/publish) and
[live CMS items](https://developers.webflow.com/data/reference/cms/collection-items/live-items/create-item-live);
WordPress.com's [OAuth2](https://developer.wordpress.com/docs/api/oauth2/); Shopify's
[pageCreate](https://shopify.dev/docs/api/admin-graphql/latest/mutations/pageCreate);
Squarespace's [developer APIs](https://support.squarespace.com/hc/en-us/articles/41325887099533-Developer-Tools-APIs-at-Squarespace).
All were read through search extracts of the vendors' own pages on 2026-10-30, not fetched directly.
The exact name of the read permission for checks was not confirmed.

**Reversal cost.** Low: the interface stays, and an adapter is added or dropped behind it.

## Revisit when

* A customer whose site is on another host asks to publish through CMOkit.
* GitHub enforces its Pages limits against sites like the ones CMOkit's customers run.
* Customers need a publish to go live in seconds rather than after a build.
