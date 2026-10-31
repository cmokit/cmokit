---
status: "draft"
kind: "requirement-driven"
date: 2026-10-30
decision-makers: [Geoff]
---

# ADR-0019: Setup is a conversation in Claude, and every credential is given on a page, never in the conversation

**Requirements served:** `HST-03`, `HST-04`, `HST-05`, `HST-10`, `NFR-05`.

## Context and Problem Statement

A hosted customer sets CMOkit up by talking to Claude, including subscribing and connecting its
event platform (`HST-03`). Setting up means paying for CMOkit, and giving CMOkit access to the event
platform's calendar, which is the customer's. Some vendors grant that access through OAuth or an app install, where the credential
goes from the vendor to CMOkit and the person only clicks. Others issue a key the person must copy:
Luma's API key is one per calendar and grants full access to it, with no read-only key documented.

A credential a customer gives CMOkit never passes through a conversation with a model (`HST-04`), as
CMOkit's own secrets never do (`NFR-05`). A key pasted into a chat sits in the conversation's history
and is sent to the model with every later turn. The person's Claude reaches CMOkit through an
authorization the person grants by signing in, never through a key they copy (`HST-05`).

## Decision Drivers

* The person never leaves the conversation for longer than one page.
* No credential is ever typed into, shown in, or returned to the conversation (`HST-04`).
* A link the conversation shows cannot be used by anyone but the person it was made for, for any
  customer but the one they act for (`HST-10`).
* Nothing to build that a vendor's own authorization already does.

## Considered Options

* The conversation drives setup; each credential is granted on the vendor's own authorization page,
  or entered on a page of CMOkit's, through a link the conversation shows
* A setup wizard on CMOkit's website, with Claude used only after it
* The person pastes each key into the conversation, and a tool stores it
* The person connects each vendor to their own Claude, and CMOkit holds no credential at all

## Decision Outcome

Chosen option: "The conversation drives setup; each credential is granted on the vendor's own
authorization page, or entered on a page of CMOkit's, through a link the conversation shows",
because it keeps setup a conversation while every credential travels from the vendor or the person
straight to CMOkit.

> The content skill asks CMOkit what is set up and what is missing. For each missing connection,
> CMOkit returns a link, made for that person and that customer, that expires within minutes and
> works once. The link opens the vendor's own page (an OAuth consent, or Stripe's hosted checkout for
> CMOkit's own subscription) or, for a vendor that only issues keys, a page of CMOkit's with one field.
> CMOkit verifies the credential with the vendor, keeps it encrypted in the customer's object
> (ADR-0030), and tells the conversation only that the connection works, never the credential. The
> MCP server has no tool that accepts a credential, and its instructions tell the model to stop a
> person who starts pasting one.

### Consequences

* Good, because no credential is ever in a conversation's history or a model's context.
* Good, because a vendor's own consent page tells the person, in the vendor's words, what CMOkit is
  being given.
* Bad, because CMOkit serves a few pages of its own: one for each vendor that only issues keys.
* Bad, because a person on a phone switches to a browser and back for each connection.
* Neutral, because a credential given on CMOkit's page is still a secret CMOkit holds, which the
  deployment reference and the rules on secrets must now name.

### Confirmation

Tests assert that no MCP tool's input schema accepts a credential, that a link is refused after use,
after expiry and for another person or customer, and that no tool result or log carries a stored
credential.

## Pros and Cons of the Options

### The conversation drives setup; each credential is granted on the vendor's own authorization page, or entered on a page of CMOkit's, through a link the conversation shows

* Good, because it meets every driver.
* Bad, because a key-only vendor still needs the person to copy a key, if only into CMOkit's page.

### A setup wizard on CMOkit's website, with Claude used only after it

* Good, because every step is on one site, designed once.
* Bad, because it breaks `HST-03`: setup becomes a website to learn, beside the conversation the
  customer already works in.

### The person pastes each key into the conversation, and a tool stores it

* Good, because it is the least to build and never leaves the chat.
* Bad, because the key is then in the conversation's history and the model's context, which `HST-04`
  forbids.

### The person connects each vendor to their own Claude, and CMOkit holds no credential at all

* Good, because CMOkit would hold no customer secrets. Luma, for one, offers an MCP server of its own.
* Bad, because CMOkit's hosted pieces, such as attributing registrations to pieces, could then only
  run inside a conversation, with every guest's personal data passing through the model.
* Bad, because each vendor's connector is different, so the skill would need to know each one.

## More Information

Sources: Luma's [API getting started](https://docs.luma.com/reference/getting-started-with-your-api)
and [MCP server](https://help.luma.com/p/mcp), read through search extracts on 2026-10-30.

**Follow-on obligations.** CLAUDE.md says secrets are supplied by the deploying environment only, and
`NFR-05` says every secret is. Both read as CMOkit's own secrets. `HST-04` covers a customer's
credentials, and CLAUDE.md needs a matching rule once this record is accepted.

**Reversal cost.** Low: the links and pages are a thin layer over the connections they create.

## Revisit when

* Every vendor CMOkit connects offers OAuth, so CMOkit's key pages can go.
* Claude offers a way for a connector to collect a credential from the person outside the
  conversation.
