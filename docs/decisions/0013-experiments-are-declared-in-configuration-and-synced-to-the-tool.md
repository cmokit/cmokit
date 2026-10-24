---
status: "proposed"
kind: "requirement-driven"
date: 2026-10-24
decision-makers: [Geoff]
---

# ADR-0013: Experiments are declared in CMOkit's configuration, and the deploy makes the experiments tool match

**Requirements served:** `EXP-02`, `EXP-03`, `EXP-05`, `EXP-06`, `LOOP-01`, `LOOP-02`, `AGT-02`, `NFR-03`, `NFR-05`.

## Context and Problem Statement

Running an experiment takes steps in two places. In CMOkit, the variant pages exist and the
experiment names its flag, its page and its variants (ADR-0009). In the experiments tool, the flag
needs its variants and split, the experiment its goal metric, and someone has to launch it, read its
results, end it and archive it. A person or an agent must do all of it from CMOkit, without opening
the tool (`EXP-05`), and starting or ending an experiment must be a change a person approves
(`EXP-06`, `LOOP-02`).

PostHog's API covers every step: an experiment is created with its flag key, variants and metrics;
`launch` activates its flag and starts it; `end` stops it; `ship_variant` gives one variant all of the
flag; `archive` retires it; and `calculate_running_time` estimates how long it must run. Writing
needs a personal API key scoped to the project, with `experiment:write` and `feature_flag:write`;
reading results also needs `query:read`. That key can change what every visitor is served, so it is a
secret of the deploying environment (`NFR-05`), and never reaches the edge or a browser.

## Decision Drivers

* Every step of an experiment is done from CMOkit (`EXP-05`).
* Starting and ending are reviewed changes (`EXP-06`), so what runs is what the repository says.
* The tool's statistics decide the winner (`EXP-02`).
* The edge never holds a key that can change the tool's configuration.
* The tool sits behind the experiments interface (`NFR-03`).

## Considered Options

* Each experiment's plan and status declared in CMOkit's configuration; the deploy makes the tool
  match, and the command line and MCP server read and estimate
* Commands that start and end experiments in the tool directly
* An agent driving the tool through its own MCP server
* The tool's configuration as infrastructure code, such as a Terraform provider

## Decision Outcome

Chosen option: "Each experiment's plan and status declared in CMOkit's configuration; the deploy
makes the tool match, and the command line and MCP server read and estimate", because the reviewed
configuration is then the one place an experiment is decided, and the tool only carries it out.

> An experiment in CMOkit's configuration names its flag, its page, its variants and their pages, its
> goal (a conversion event), an optional split, and its status: `draft`, `running` or `ended`. The
> deploy, after the edge is deployed, makes the tool match: it creates the flag and the experiment
> for a new one, launches it when its status becomes `running`, and ends it when its status becomes
> `ended`, after which the edge serves the control. Removing an experiment from the configuration
> archives it in the tool. The deploy changes nothing in the tool that the configuration does not
> name, and refuses to change an experiment it did not create.
>
> `cmokit experiments plan` estimates the running time from the goal's baseline and a minimum
> detectable effect. `cmokit experiments results` reads each running experiment's results, as the
> tool computes them. The MCP server offers the same, so an agent writes the change and reads the
> results without the tool. The tool's administrative key is a secret of the deploying environment,
> read by the command line alone.

### Consequences

* Good, because an experiment's whole life — planned, started, read, ended — is a change in one
  repository, reviewed like any other.
* Good, because what the tool runs can always be rebuilt from the configuration.
* Good, because the weekly loop's proposal and its approval are one pull request (`LOOP-01`).
* Bad, because a change made in the tool by hand is overwritten or refused at the next deploy, so the
  tool is effectively read-only for experiments CMOkit manages.
* Bad, because the experiments interface grows an administrative half, which a second tool's adapter
  must implement too.
* Bad, because the deploying environment holds a second PostHog key, which can change what visitors
  are served.

### Confirmation

Tests run the sync against a stand-in for the tool and assert, for each change of status, the calls
made and that a second run makes none. The boundary check fails the build if the edge depends on the
administrative adapter.

## Pros and Cons of the Options

### Each experiment's plan and status declared in CMOkit's configuration; the deploy makes the tool match, and the command line and MCP server read and estimate

* Good, because it meets every driver.
* Bad, because starting an experiment waits for a deploy.

### Commands that start and end experiments in the tool directly

* Good, because starting or ending takes effect at once.
* Bad, because the tool then holds state the repository does not, so a running experiment is not a
  reviewed change (`EXP-06`), and the configuration and the tool drift.

### An agent driving the tool through its own MCP server

* Good, because PostHog already publishes one, and nothing needs building.
* Bad, because the agent changes the tool directly, unreviewed, and a person without an agent still
  has to open the tool.
* Bad, because the steps are then PostHog's, so changing tool changes how every experiment is run
  (`NFR-03`).

### The tool's configuration as infrastructure code, such as a Terraform provider

* Good, because it is declarative and reviewed, as this record wants.
* Bad, because it adds a second language and a state file to keep, and still leaves results and
  running time to be read in the tool.

## More Information

Source: PostHog's experiments API, `products/experiments/backend/presentation/views.py` in
[PostHog/posthog](https://github.com/PostHog/posthog).

**Reversal cost.** Low: the configuration's experiment entries stay; dropping the sync returns the
tool's steps to a person.

## Revisit when

* Waiting for a deploy to start or end an experiment is too slow for an adopter.
* Adopters need experiment settings the configuration does not carry, such as holdouts or
  secondary metrics, often enough to declare them.
