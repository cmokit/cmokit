---
status: "draft"
kind: "requirement-driven"
date: 2026-10-30
decision-makers: [Geoff]
---

# ADR-0034: The content plugin names the Claude settings it depends on, and says in plain words when one is missing

**Requirements served:** `CNT-22`, `CNT-23`, `HST-03`, `HST-08`.

## Context and Problem Statement

The content plugin runs in the person's own Claude (`HST-08`), set up in conversation (`HST-03`), on
the web and on a phone (`CNT-22`). What it can do depends on settings in that Claude, which are part
of the product: they are listed, and when one is missing the person is told what and how to fix it,
and the plugin does what it can without it (`CNT-23`). Someone has to decide the list and the
behaviour when each is missing.

From Anthropic's documentation, read on 2026-10-30:

| Setting | Where and on which plans |
|---|---|
| A plan with plugins | Pro, Max, Ultra, Team and Enterprise; not Free |
| The plugin added | Customize, then Plugins, on the web or desktop, from a marketplace's Git repository; adding one from the mobile apps is not documented. Once added, its skills and remote connectors work in chat on the web, desktop and mobile |
| Code execution on | Skills run in the code sandbox, so "Code execution and file creation" must be on |
| CMOkit's connector connected | Installing a plugin connects nothing; each connector is connected from the plugin's Connectors tab. Connecting on mobile is in beta; a connector connected on the web or desktop is available on iOS and Android |
| Claude Design | A template inside Claude, on by default; on the phone a design is asked for in chat and viewed in the Artifacts tab |
| A design system, published as default | Beta on Pro, Max, Team and Enterprise; off on Enterprise until an Owner turns it on |
| Scheduled tasks (optional) | All paid plans; they run in Anthropic's cloud with the person's connectors and plugins, and can be created from any conversation |
| A scheduler or editor connector (optional) | Whatever the person already has |

On Team and Enterprise, an Owner controls which plugin sources members see and adds custom connectors
for the organization.

## Decision Drivers

* The person learns what is missing from the plugin itself, in plain words, at the moment it matters.
* Each missing setting costs only what depends on it.
* The list is kept in one place and changes when Claude's features do.

## Considered Options

* Required and optional settings listed in the plugin's documentation and checked by the skill and the
  server at the start of each task, each with its own fallback
* A setup checklist on CMOkit's website
* Require every setting before anything works

## Decision Outcome

Chosen option: "Required and optional settings listed in the plugin's documentation and checked by
the skill and the server at the start of each task, each with its own fallback", because each check
happens where the missing setting is noticed, and each fallback keeps what still works.

> **Required:** a plan with plugins, the content plugin added on the web or desktop, code execution
> on, and CMOkit's connector connected and signed in. **For visuals:** Claude Design and a design
> system published as the default. **Optional:** a weekly scheduled task, and any scheduler or
> editor connector the person already has. The plugin's README lists them, with where each is turned
> on.
>
> When one is missing:
>
> * **Code execution off, or the plugin not added.** The skill cannot load, so CMOkit's server says
>   so: its instructions tell the model to tell the person how to turn it on.
> * **CMOkit's connector not connected.** The skill says so and how to connect it, and offers only to
>   draft from what the person says in this conversation, warning that nothing is kept and no brand
>   context is read.
> * **No design system.** The skill writes each piece without visuals, says why, and offers to make a
>   design system from the person's site, logo and fonts.
> * **No scheduled task.** The person starts the week themselves; the skill offers once to schedule
>   it.
>
> Setup happens on the web or the desktop app; everything after it works on a phone.

### Consequences

* Good, because nobody is left with a plugin that silently does less.
* Good, because the server's instructions reach the person even when the skill itself cannot load.
* Bad, because the list follows Claude's features, which change often and must be checked at each
  release.
* Bad, because the plugin is unavailable on Claude's Free plan.

### Confirmation

Evals run the skill with the connector absent and with no design system, and assert the plain-words
explanation and the fallback. The plugin's README is checked against Anthropic's documentation before
each release, by review.

## Pros and Cons of the Options

### Required and optional settings listed in the plugin's documentation and checked by the skill and the server at the start of each task, each with its own fallback

* Good, because it meets every driver.
* Bad, because the checks and fallbacks are behaviour of the skill to evaluate and maintain.

### A setup checklist on CMOkit's website

* Good, because the whole list is visible in one place.
* Bad, because the person meets a missing setting in Claude, not on CMOkit's site, so the checklist
  is never where it is needed.

### Require every setting before anything works

* Good, because every person gets the whole product, or none of it.
* Bad, because a person without a design system could not even write a caption, which `CNT-23` rules
  out.

## More Information

Sources: Anthropic's [plugins in Claude](https://support.claude.com/en/articles/13837440-use-plugins-in-claude),
[plugins overview](https://claude.com/docs/plugins/overview),
[plugin platform support](https://claude.com/docs/plugins/platform-support),
[skills](https://claude.com/docs/skills/overview),
[connectors on mobile](https://support.claude.com/en/articles/11176164-use-connectors-to-extend-claude-s-capabilities),
[Claude Design](https://support.claude.com/en/articles/14604416-get-started-with-claude-design),
[design systems](https://support.claude.com/en/articles/14604397-set-up-your-design-system-in-claude-design)
and [scheduled tasks](https://support.claude.com/en/articles/13854387-schedule-recurring-tasks-in-claude-cowork).
Anthropic's pages disagree on whether skills and Claude Design are on the Free plan; plugins are not,
so the plugin is not either way.

**Reversal cost.** Low: the list and fallbacks are text in the skill and the server's instructions.

## Revisit when

* Claude adds plugins to the Free plan, or lets a plugin be added from the mobile apps.
* Design systems leave beta, or change plans.
* Claude lets a plugin connect its own connector when it is added.
