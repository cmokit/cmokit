---
status: "proposed"
kind: "requirement-driven"
date: 2026-10-25
decision-makers: [Geoff]
---

# ADR-0014: A lead's messages are a sequence declared in CMOkit's configuration, kept in a Durable Object per lead

**Requirements served:** `LEAD-01`, `LEAD-02`, `LEAD-03`, `LOOP-01`, `LOOP-02`, `NFR-03`, `NFR-06`.

## Context and Problem Statement

A visitor who signs up becomes a lead, and the lead is then sent a series of messages until they
start a trial or stop them. The lead must reach that series with its channel and variant without a
person acting (`LEAD-01`), no key that can write to a messaging tool may reach a browser (`LEAD-02`),
and the lead must be told what is coming and be able to stop it in one step (`LEAD-03`). The weekly
loop is to propose new messages as well as new pages (`LOOP-01`), and nothing it proposes reaches a
person until someone approves it (`LOOP-02`).

What is needed first is small. The growth plan this serves says to run one linear sequence until its
numbers show where leads drop off, and to add branching only then. A linear sequence is a list of
messages, each sent some time after the last, that stops when the lead converts or unsubscribes.

The candidates, as their own documentation stood on 2026-10-25:

| | Customer.io | Loops | Resend Automations | Dittofeed | Novu |
|---|---|---|---|---|---|
| What it is | Commercial journeys, email and SMS | Commercial email for SaaS | Commercial, launched April 2026 | Open source, Customer.io-like | Open source notification workflows |
| Price at 5,000 contacts | From $100 a month | $25 a month | $40 a month (marketing plan) | Self-hosted, or its cloud | Self-hosted, or its cloud |
| Self-hosted | Not offered | Not offered | Not offered | Postgres, ClickHouse, Temporal | MongoDB, Redis, four services |
| SMS | Through the adopter's own Twilio account | No | No | Yes | Yes |

## Decision Drivers

* Nothing always-on and nothing to pay while a business is small (`NFR-06`).
* A message is a reviewed change, as an experiment is (ADR-0013), so an agent can propose one
  (`LOOP-01`, `LOOP-02`).
* No write key in a browser (`LEAD-02`).
* What the tool does is swappable behind an interface named for the job (`NFR-03`).
* Only what is needed now is built: one linear sequence.

## Considered Options

* Sequences of CMOkit's own: declared in configuration, messages as files, each lead's place kept in
  a Durable Object, sent through a channel adapter
* Customer.io
* Loops
* Resend Automations
* Dittofeed, self-hosted
* Novu, self-hosted

## Decision Outcome

Chosen option: "Sequences of CMOkit's own", because a linear sequence is a small thing to build on
the store CMOkit already has (ADR-0006), and building it keeps every message in the repository, where
the loop can propose a change to it like any other.

> A sequence is CMOkit configuration: the event that starts it, the events that stop it, and its
> messages, each a template file in the site's repository with the delay after the one before. A
> form that records a conversion and carries an email address makes a lead: the edge passes the lead,
> with the visitor's id, channel and variant, to the lifecycle Worker, which keeps no key in the
> browser's reach. Each lead's place in its sequence is kept in a Durable Object of its own, whose
> alarm sends the next message through the messaging interface; the stopping events, an unsubscribe
> and a suppression end it. Every send, open, click and unsubscribe is recorded in analytics under
> the visitor's id. A lead's object forgets the address once its sequence ends. Only linear sequences
> are built; branching waits for the numbers to call for it.

### Consequences

* Good, because a new message, or a change to one, is a pull request a person approves, and the
  deploy ships it.
* Good, because a small business pays only for sending, and nothing runs when no one signs up.
* Good, because sends, opens and clicks are in the same analytics as the visit and the conversion,
  under one identity (`MSR-04`).
* Bad, because there is no visual journey editor, segmentation or message testing interface: a person
  who is not a developer edits messages through an agent or a pull request.
* Bad, because the lifecycle Worker and its first Durable Objects must exist before any lead is
  messaged.
* Bad, because SMS, when it is wanted, is a second channel adapter, and the adopter's own Twilio
  registration (A2P 10DLC in the US) is needed either way.

### Confirmation

Tests of the sequence run against a stand-in for the messaging interface and assert, for each step
and each stopping event, the messages sent and that delivering an event twice acts once. That no
handler names a messaging vendor is checked in review.

## Pros and Cons of the Options

### Sequences of CMOkit's own

* Good, because it meets every driver.
* Bad, because unsubscribing, suppression and the stopping events are CMOkit's to get right; the
  sending service takes some of this (ADR-0015).

### Customer.io

* Good, because it has branching journeys, segments, message testing, email and SMS, and handles
  unsubscribes and deliverability.
* Bad, because it starts at $100 a month for 5,000 profiles, and its journeys and messages live in its
  interface, so making them reviewed changes means building a sync like the experiments one.
* Bad, because its SMS still runs through the adopter's own Twilio account and registration, so it
  does not take that work away.
* Bad, because its strength is branching, which the growth plan defers.

### Loops

* Good, because it is simple, API-first and $25 a month for 5,000 contacts.
* Bad, because its sequences live in its interface, and it has no SMS.

### Resend Automations

* Good, because it adds delays, wait-for-event and branching to an email API.
* Bad, because it is a second email vendor beside the one an adopter sends with, and its sequences
  live in its interface.

### Dittofeed, self-hosted

* Good, because it is open source and the closest to Customer.io.
* Bad, because it needs Postgres, ClickHouse and Temporal running all the time, which neither runs on
  Cloudflare nor scales to zero (ADR-0003).

### Novu, self-hosted

* Good, because it is open source and glues one workflow to many senders, SendGrid and Twilio among
  them.
* Bad, because it needs MongoDB, Redis and four services running all the time (ADR-0003), and it is
  built for product notifications rather than nurture.

## More Information

Sources: Customer.io's [SMS setup](https://docs.customer.io/messaging/channels/sms/get-started/) and
[pricing](https://customer.io/pricing); Loops's [billing](https://loops.so/docs/account/billing);
[Dittofeed](https://dittofeed.com/); Novu's
[self-hosting](https://docs.novu.co/community/self-hosting-novu/overview).

**Follow-on obligations.** The lifecycle Worker, its Durable Objects, the edge's hand-off of a lead,
the sequence's configuration and the one-click unsubscribe (RFC 8058) the edge serves.

**Reversal cost.** Low to moderate: buying a tool later makes it an adapter behind the same
interface. Lead capture and attribution carry over; the messages would move into the tool.

## Revisit when

* Someone who is not a developer must edit sequences without an agent.
* The numbers show a branch is needed, or segments of leads need different sequences.
* SMS becomes a main channel.
