# Contributing to CMOkit

Thanks for your interest. Bug reports, documentation fixes and code are all welcome.

This file covers the **process** of contributing, and deliberately holds no project rules. Those
live in [`CLAUDE.md`](CLAUDE.md) and the [decision records](docs/decisions/README.md); restating
them here would give them a second home to drift from.

## Before you start

Read [`CLAUDE.md`](CLAUDE.md). Every rule in it cites the decision record holding its reasoning. If
a task appears to require breaking a rule, ask rather than working around it.

[How CMOkit fits around a site](docs/explanation/architecture.md) shows the moving parts: the edge
and lifecycle Workers, the site on its host, and the tools behind them.

## Reporting a bug

Open an issue. Include what you did, what you expected, what happened instead, and the versions of
the `@cmokit` packages, Node and Wrangler you were running.

**Do not open a public issue for a security vulnerability.** Contact the maintainers privately.

## Suggesting a change

Open an issue before writing code for anything larger than a fix, so the approach can be agreed
before you spend time on it.

A decision that future work should be bound by belongs in a decision record rather than a code
comment. [`docs/decisions/README.md`](docs/decisions/README.md) explains the format and
[`adr-template.md`](docs/decisions/adr-template.md) is the starting point.

## Getting started

Four steps. You do the ones that involve credentials or installing software yourself, in your own
terminal, and Claude Code never sees your GitHub credentials. Claude Code does the rest.

1. **Fork** [`cmokit/cmokit`](https://github.com/cmokit/cmokit) and clone your fork. This needs
   `git` and the [`gh`](https://cli.github.com/) CLI, signed in:

   ```bash
   gh auth login                              # once, if you have not already
   gh repo fork cmokit/cmokit --clone --remote
   cd cmokit
   ```

2. **Install** [Node 24](https://nodejs.org/) or later, which brings npm, and
   [Claude Code](https://claude.com/claude-code). A cloud Claude Code session provisions Node for
   you ([Setting up](#setting-up)).
3. **Run Claude Code** in the clone.
4. **Paste this prompt:**

````text
Set me up to contribute to CMOkit. Do not use any GitHub credentials, and do not commit, push or
open pull requests. Go one step at a time, and wait for me where a step needs me.

1. Read CLAUDE.md and CONTRIBUTING.md.
2. Verify that Node is 24 or later. Tell me exactly what is missing; do not work around it. Then
   run `npm ci`.
3. Run `npm run check` and `npm test`, then `npm run build` and `npm run build:starter`.
4. Report each step's result, and anything you could not do, with the error output.
````

When you have a change ready, ask Claude Code to commit it on a branch, then push and open the pull
request yourself from your terminal ([Opening a pull request](#opening-a-pull-request)):

```bash
git push -u origin <branch>
gh pr create --repo cmokit/cmokit
```

## Setting up

The prompt above does this for you. This is the reference for what it installs and why, and for
doing it by hand.

You need Node 24 or later. Everything else comes from npm:

```bash
npm ci
```

**Using Claude Code?** Any Claude Code environment with outbound network access works, cloud or
local. A cloud session is provisioned by the SessionStart hook in `.claude/settings.json`, which
runs [`scripts/cloud-session.ts`](scripts/cloud-session.ts): it installs the Node 24 that script
pins, after checking its checksum, puts it first on the path, and runs `npm ci` when the lockfile
has changed. That hook does nothing locally, so a local session needs Node 24 installed first.

**Hosts it needs to reach:**

| For | Host |
|---|---|
| Node 24, in a cloud session | `nodejs.org` |
| The dependencies (`npm ci`) | `registry.npmjs.org` |

A cloud environment's default allow list already has the npm registry, and reaches GitHub through
its own proxy. To paste into a custom allow list, keeping the default list too:

```
nodejs.org
```

Nothing here needs a secret. Building and testing CMOkit calls no vendor: the tests use stand-ins
for PostHog, SendGrid and Cloudflare.

## Running the checks

```bash
npm run check   # types, the decision records, the package boundaries, the generated pages
npm test        # every package's tests, with Node's test runner
npm run build && npm run build:starter
```

[`.github/workflows/check.yml`](.github/workflows/check.yml) runs these on every pull request, and
is the authority on what has to pass.

Some documents are generated from source: their first line names the script that writes them, and
`npm run check` fails when one is stale. After changing what one describes, edit its script, run
`npm run docs`, and commit both.

## Opening a pull request

- Work on a branch of your fork. Never commit to `main`.
- Open the pull request from your fork against `cmokit/cmokit`.
- One logical change per commit, with a subject line that says what is now true.
- Cite the requirement or `ADR-` id when a change implements or follows one. Requirement ids are
  defined in [`requirements.md`](docs/product/requirements.md).
- Say which checks you ran locally, and flag anything you could not verify.
- If part of the work is incomplete or blocked, say so. Scaling work down is a maintainer's call
  rather than something to do quietly.

## Review

A maintainer will review. Expect as many questions about reasoning as about code: *which record
does this follow, and does it still hold?* is the substance of the review.

## Releasing

Maintainers only. Publishing a GitHub release stages every package whose version is not yet on npm,
through [`.github/workflows/publish.yml`](.github/workflows/publish.yml). Nothing is live until a
maintainer approves each staged version under two-factor authentication, on npmjs.com (Staged
Packages) or with `npm stage approve <stage-id>`. A cloud session cannot complete that sign-in, so
approvals are made from a maintainer's own machine.

## Licensing

CMOkit is [Apache 2.0](LICENSE). Contributions are accepted under the same license, which
Apache 2.0 § 5 makes the default. There is no separate CLA to sign.
