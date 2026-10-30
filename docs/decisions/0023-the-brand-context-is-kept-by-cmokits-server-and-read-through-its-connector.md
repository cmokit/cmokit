---
status: "draft"
kind: "requirement-driven"
date: 2026-10-30
decision-makers: [Geoff]
---

# ADR-0023: The brand context is kept by CMOkit's server, versioned, and read through its connector before every draft

**Requirements served:** `CNT-01`, `CNT-05`, `CNT-06`, `CNT-08`, `CNT-09`, `CNT-22`, `HST-13`.

## Context and Problem Statement

Brand voice and strategy are the content plugin's core feature. The brand context holds positioning
and what is sold, audiences, values and lines not to cross, voice and tone, approved and rejected
examples, and AI tells to avoid (`CNT-01`). It is read before anything is written (`CNT-06`), on the
web and on a phone (`CNT-22`). It changes only when the person approves a change (`CNT-08`), and the
person sees and edits all of it, sees every change with when and why, undoes any change, and takes it
with them (`CNT-09`, `HST-13`). Something has to keep it where the skill reliably reads it, in any
conversation, and where every change is a version.

What Claude offers, from Anthropic's documentation:

* **Claude Docs**, living documents on every plan, viewable and editable on mobile, exportable to
  Word, PDF, Markdown or Google Docs. Found again from any conversation through the Artifacts tab; a
  documented way for a skill in a new conversation to read a doc by id was not found.
* **Design systems** in Claude Design, beta on Pro, Max, Team and Enterprise: "each design system
  becomes an artifact Claude can use in any chat". They hold a visual identity; writing to one from a
  skill is not documented.
* **Projects**, whose instructions and knowledge apply to every chat in the project, changed only by
  a person with edit access.
* **Memory**, on by default on Free, Pro and Max, kept as free-text topics that Claude saves itself.
* **Artifact storage**, 20 MB of text per artifact, on Pro and above, on the web and desktop only.

## Decision Drivers

* The skill reads the whole, current brand context at the start of every task, in any conversation,
  on any surface (`CNT-06`, `CNT-22`).
* Every change is a version, with who approved it, when, why and the signals behind it (`CNT-08`,
  `CNT-09`).
* The person sees and edits it at any time, and exports it (`CNT-09`, `HST-13`).
* No change takes effect without the person's approval, and nothing in it is invented (`CNT-05`).

## Considered Options

* CMOkit's server keeps the brand context as versions, read and changed through its connector
* A Claude Doc the skill reads and edits
* The README of the brand's Claude Design design system
* A Claude Project's instructions and knowledge
* Claude's memory
* A file in the site's repository

## Decision Outcome

Chosen option: "CMOkit's server keeps the brand context as versions, read and changed through its
connector", because it is the only option a skill can read in every conversation on every surface,
whose every change is a version with its reason.

> The brand context is a structured document of the sections `CNT-01` lists, kept by CMOkit's server
> in the customer's object (ADR-0030) as a series of versions. The skill reads the current version
> through the connector at the start of every task. A change, proposed by the skill from signals
> (ADR-0025) or asked for by the person, is shown to the person as a difference, and saved as a new
> version only after they approve it, with its reason and the signals behind it. Any earlier version
> can be restored, which is itself a new version. The person sees the brand context by asking for it
> in any conversation, where the skill shows it in full or as a Claude Doc, and edits it by saying what
> to change. A Claude Doc made from it is a copy, labeled as one. The brand context is exported as
> Markdown with its history.

### Consequences

* Good, because every draft starts from the same, current brand context, wherever the person is.
* Good, because every change has a version, a reason and its evidence, so the context's improvement
  is visible and any bad change is one step to undo.
* Bad, because the person cannot edit the brand context directly in a document; a Doc they edit by
  hand changes nothing until they ask Claude to make the change.
* Bad, because without CMOkit's connector, the skill has no brand context to read (ADR-0034).
* Neutral, because the brand context is the customer's data on CMOkit's server, exported on request
  and deleted with the account.

### Confirmation

Tests of the server assert that a change is saved only through the tool that records an approval,
that every save is a new version with a reason, and that restoring a version restores it exactly.
Evals assert the skill reads the brand context before its first draft in a conversation.

## Pros and Cons of the Options

### CMOkit's server keeps the brand context as versions, read and changed through its connector

* Good, because it meets every driver.
* Bad, because the brand context lives with CMOkit, not in a document the person opens directly.

### A Claude Doc the skill reads and edits

* Good, because the person sees and edits it as a document, on the web and on a phone, and exports it
  as Markdown, Word or PDF.
* Bad, because no documented way lets a skill in a new conversation find and read it by itself, so
  "read before every draft" would rest on the person attaching it.
* Bad, because a direct edit carries no reason and no approval record, so the history `CNT-09` asks
  for has gaps.

### The README of the brand's Claude Design design system

* Good, because Claude can use a design system in any chat, and voice would sit beside visual
  identity.
* Bad, because design systems are in beta and not on the Free plan, writing to one from a skill is
  not documented, and a design system is versioned for visuals, not for reasons and signals.

### A Claude Project's instructions and knowledge

* Good, because a project's instructions are read in every chat in it, with nothing to build.
* Bad, because only the person can change them, by hand, so every approved change is a copy and
  paste, and the project keeps no history of why.
* Bad, because all content work would have to happen inside that one project.

### Claude's memory

* Good, because it is on by default and follows the person everywhere.
* Bad, because Claude decides what to save, as free text, so nothing guarantees approval before a
  change or completeness when read.

### A file in the site's repository

* Good, because it is versioned by git with every change reviewed.
* Bad, because most creators have no repository, and none on their phone.

## More Information

Sources: Anthropic's [Claude Docs](https://support.claude.com/en/articles/16923645-get-started-with-claude-docs),
[design systems](https://support.claude.com/en/articles/14604397-set-up-your-design-system-in-claude-design),
[projects](https://support.claude.com/en/articles/9519177-how-can-i-create-and-manage-projects),
[memory](https://support.claude.com/en/articles/11817273-use-claude-s-chat-search-and-memory-to-build-on-previous-context)
and [artifacts](https://support.claude.com/en/articles/17153992-what-are-artifacts-and-how-do-i-use-them),
read on 2026-10-30.

**Reversal cost.** Low: the brand context exports as Markdown with its history, so moving it is a copy.

## Revisit when

* Claude documents a store that a skill can read and write in any conversation on every surface, with
  versions, so the brand context can live in the person's own Claude.
* Claude Docs gains a documented way for a skill to read a doc by id across conversations.
