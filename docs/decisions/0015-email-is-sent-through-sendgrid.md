---
status: "proposed"
kind: "requirement-driven"
date: 2026-10-25
decision-makers: [Geoff]
---

# ADR-0015: Email is sent through SendGrid, behind the messaging interface

**Requirements served:** `LEAD-01`, `LEAD-02`, `LEAD-03`, `NFR-03`, `NFR-05`.

## Context and Problem Statement

CMOkit's sequences (ADR-0014) need a service that sends their email and keeps the sending reputation:
authenticated domains, bounce and complaint handling, and the unsubscribe that mail providers require
of bulk senders, including one-click unsubscribe (RFC 8058). A nurture email is marketing email, not
transactional.

The candidates, as their own documentation stood on 2026-10-25:

| | SendGrid | Amazon SES | Resend | Cloudflare Email Service |
|---|---|---|---|---|
| Price | $19.95 a month for 50,000; no free plan | About $0.10 per 1,000 | $20 a month for 50,000 | 3,000 a month on Workers Paid, then $0.35 per 1,000 |
| Marketing email | Yes | Yes | Yes | No: transactional only |
| Unsubscribe | Unsubscribe groups; sends to the suppressed are dropped | Built by the sender | Audiences, on its marketing plan | Not applicable |
| Events | Signed (ECDSA) event webhook | Through SNS | Webhooks | Not applicable |

## Decision Drivers

* The adopter's first site already sends with it, so its domain authentication and reputation exist.
* Marketing email is allowed.
* Unsubscribes and suppression are kept by the service, not rebuilt.
* Its events can be verified before they are acted on.
* Its write key stays in the deploying environment (`NFR-05`), never in a browser (`LEAD-02`).

## Considered Options

* SendGrid
* Amazon SES
* Resend
* Cloudflare Email Service

## Decision Outcome

Chosen option: "SendGrid", because it is already in use, allows marketing email, keeps unsubscribes
and suppressions itself, and signs its events.

> The messaging interface's email adapter sends through SendGrid's Mail Send API, from the lifecycle
> Worker, with an API key restricted to sending and suppressions, a Worker secret. Each message
> carries CMOkit's own unsubscribe link and one-click headers (RFC 8058), which the edge serves, and
> belongs to the site's unsubscribe group, so SendGrid drops later sends to anyone who unsubscribed,
> bounced or complained, and an unsubscribe through CMOkit's link is added to the group's
> suppressions. SendGrid's event webhook is verified by its ECDSA signature
> before CMOkit acts on it, and an unsubscribe, bounce or spam report ends the lead's sequence. No
> handler names SendGrid; only the adapter does.

### Consequences

* Good, because unsubscribes and suppression are SendGrid's, and a send it drops costs nothing.
* Good, because a second sender is a second adapter behind the same interface.
* Bad, because SendGrid has no free plan, so a site pays $19.95 a month from its first lead.
* Neutral, because the key and the webhook's verification key join the deployment reference.

### Confirmation

The adapter's tests run against recorded SendGrid requests and events, with no account (`NFR-04`),
and refuse an event whose signature does not verify. That SendGrid delivers the unsubscribe headers
CMOkit sets is checked against a real send.

## Pros and Cons of the Options

### SendGrid

* Good, because it meets every driver.
* Bad, because it costs more than SES at volume, and has no free plan.

### Amazon SES

* Good, because it is the cheapest by far at volume.
* Bad, because unsubscribe handling and suppression lists are the sender's to build, and it adds an
  AWS account where the adopter already has SendGrid.

### Resend

* Good, because its API is simple and its price is close to SendGrid's.
* Bad, because it is a new vendor where SendGrid is already set up.

### Cloudflare Email Service

* Good, because it keeps every part of CMOkit with one vendor, and a Worker sends through a binding
  with no key.
* Bad, because it allows transactional email only, and a nurture email is marketing.

## More Information

Sources: SendGrid's [unsubscribe groups](https://docs.sendgrid.com/ui/sending-email/group-unsubscribes)
and [suppressions](https://docs.sendgrid.com/for-developers/sending-email/suppressions); Cloudflare
Email Service's [pricing](https://developers.cloudflare.com/email-service/platform/pricing/) and
[FAQ](https://developers.cloudflare.com/email-service/reference/faq/).

**Reversal cost.** Low: another sender is another adapter, and moving the domain authentication and
the suppression list to it.

## Revisit when

* Cloudflare Email Service allows marketing email.
* Sending volume makes SES's price difference matter.
