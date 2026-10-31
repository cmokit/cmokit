---
status: "draft"
kind: "requirement-driven"
date: 2026-10-30
decision-makers: [Geoff]
---

# ADR-0022: The content plugin is a second plugin, beside the coding-agent plugin, in the same marketplace

**Requirements served:** `AGT-02`, `AGT-03`, `HST-08`, `CNT-21`, `CNT-22`, `CNT-27`.

## Context and Problem Statement

`AGT-02` has CMOkit ship a skill that teaches a coding agent to use it, and an MCP server, packaged
together as one plugin. That plugin's MCP server is `cmokit mcp`, a local server on stdio that reads
the site's configuration and a PostHog key from the shell that starts the agent (ADR-0013). `AGT-03`
has the starter give a product the means to ship its own plugin. The content plugin serves someone
else: a person who is not a developer, in claude.ai and the Claude mobile app (`CNT-22`), alongside
any other plugins they use (`HST-08`), with or without any of the engine configured (`CNT-21`).

In Claude's chat, on the web, desktop and mobile, a plugin's skills, commands and remote connectors
work, but its local MCP servers, agents and hooks are ignored. A person adds a plugin marketplace from
a Git repository, and installs plugins from it one by one.

## Decision Drivers

* A creator installs what they use and nothing else.
* A coding agent is not handed a content workflow, and a creator's chat is not handed a coding skill.
* One place to publish both, versioned with the engine.
* Content works with none of the engine configured (`CNT-21`).

## Considered Options

* A second plugin, `cmokit-content`, beside the coding-agent plugin in one marketplace in this
  repository
* Part of the coding-agent plugin
* Something the starter ships into each site, under `AGT-03`
* A separate repository of its own

## Decision Outcome

Chosen option: "A second plugin, `cmokit-content`, beside the coding-agent plugin in one marketplace
in this repository", because the two plugins have different users, different surfaces and different
servers, and share only the repository they are versioned in.

> This repository is a plugin marketplace with two plugins. The coding-agent plugin of `AGT-02` keeps
> its skill and its local MCP server. The content plugin holds the content skill and declares
> CMOkit's remote MCP server, hosted or self-hosted (ADR-0029); it has no local server, so everything
> in it works in chat. Neither plugin depends on the other. The coding-agent plugin may also connect
> to the content server, to read a customer's brand context for the variant pages it writes
> (`CNT-27`); experiments work without it. The content plugin needs none of the engine's packages or
> configuration.

### Consequences

* Good, because a creator's chat loads only the content skill, and a coding agent loads only its own.
* Good, because each plugin's evals measure its own skill against its own users' tasks.
* Bad, because the repository holds two plugins and a marketplace beside its packages, which the
  rules on packages do not yet describe.
* Neutral, because a person who is both developer and creator installs both.

### Confirmation

A check fails the build if the content plugin declares a local MCP server, or if either plugin
depends on the other.

## Pros and Cons of the Options

### A second plugin, `cmokit-content`, beside the coding-agent plugin in one marketplace in this repository

* Good, because it meets every driver.
* Bad, because two plugins are two release notes and two sets of evals.

### Part of the coding-agent plugin

* Good, because there is one thing to install.
* Bad, because a creator's chat would carry a local server it ignores and a coding skill that does
  not apply, and a coding agent would carry a content workflow.
* Bad, because `AGT-02` describes a plugin for coding agents, and folding content into it changes
  what that plugin is for.

### Something the starter ships into each site, under `AGT-03`

* Good, because a site created from the starter would have it from the start.
* Bad, because `AGT-03` is for a product's own plugin, and the content plugin is CMOkit's; a copy in
  each site never gets fixes.
* Bad, because most creators never touch a repository, so they would never see it.

### A separate repository of its own

* Good, because a creator browsing it sees only content.
* Bad, because the server and the skill change together and would be released from two places.

## More Information

Sources: Anthropic's [plugins overview](https://claude.com/docs/plugins/overview) and
[plugin platform support](https://claude.com/docs/plugins/platform-support), read on 2026-10-30.

**Follow-on obligations.** CLAUDE.md lists the packages; the plugins and the marketplace manifest need
a line of their own there once this record is accepted.

**Reversal cost.** Low: plugins can be merged or moved, and a person reinstalls.

## Revisit when

* Most people who install one plugin install both.
* Claude's chat starts loading local MCP servers, so one plugin could serve both users.
