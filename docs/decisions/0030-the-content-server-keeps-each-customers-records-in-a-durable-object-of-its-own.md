---
status: "draft"
kind: "requirement-driven"
date: 2026-10-30
decision-makers: [Geoff]
---

# ADR-0030: The content server keeps each customer's records in a Durable Object of its own, and stores nothing it can read elsewhere

**Requirements served:** `CNT-07`, `CNT-09`, `CNT-11`, `CNT-17`, `HST-04`, `HST-10`, `HST-13`, `NFR-06`.

## Context and Problem Statement

The content server (ADR-0029) has to keep, per customer: the brand context and its versions
(ADR-0023), the pieces with their signals and posts (`CNT-07`, `CNT-17`, ADR-0025), and the customer's
connections, some of them credentials (`HST-04`). Beside it, the issuer keeps each person's sign-in
identities, pending email codes and the customers the person belongs to (ADR-0018). Nothing done for one customer reaches another's records
(`HST-10`); a customer exports everything and closes its account, which deletes it (`HST-13`); and
nothing runs or is billed while a customer is idle (`NFR-06`).

CMOkit already keeps per-customer and per-lead state in a Durable Object each (ADR-0006, ADR-0014): a
single instance, addressed by name, handling one request at a time over a SQLite database of its own,
billed for requests, rows and storage, and on Workers' free plan with daily limits of 100,000
requests, 100,000 rows written and 5 GB stored. A customer's content is small: a brand context of a
few thousand words, a few versions a month, and a handful of pieces a week.

## Decision Drivers

* Store nothing that is kept, and can be read, somewhere else.
* One customer's records cannot be addressed from another's request (`HST-10`).
* A credential is encrypted where it is kept, and never leaves except to its vendor (`HST-04`).
* Export and deletion are whole and simple (`HST-13`).
* Scales to zero, on the store CMOkit already uses (`NFR-06`).

## Considered Options

* A Durable Object per customer and one per person, holding only CMOkit's own records
* One Cloudflare D1 database for every customer, each row keyed by customer
* A copy of each customer's events and guests, kept in step with the event platform

## Decision Outcome

Chosen option: "A Durable Object per customer and one per person, holding only CMOkit's own records",
because it gives each customer storage no other customer's request can address, on the store CMOkit
already relies on, and keeps the least.

> **A customer's object**, named by the customer's id, holds: the brand context's versions, each with
> who approved it, when, why and its signals; the pieces, each with its offer, format, audience,
> drafts, the words approved, any rejection and its reason, the brand context version it was written
> from, its tracked links, where and when it was posted, and its weekly result counts; the customer's
> users; its connections, each a vendor, an identifier such as a Luma calendar, and any
> credential; and its access as the lifecycle last set it (ADR-0017).
>
> **A person's object**, the issuer's, named by the person's id, holds the person's sign-in
> identities, their proven email address and the customers they belong to.
>
> **A sign-in identity's object**, the issuer's, named by a provider and its subject id, or by
> `email:` and an address, holds the person it belongs to and, for an address, its pending code:
> hashed, with its expiry and the attempts left, and deleted when used or expired.
>
> **Credentials** are encrypted with AES-GCM under a key that is a Worker secret of the deployment,
> and are decrypted only to call their vendor.
>
> **Not stored**: events, which are read from the event platform when needed; guests' names, emails
> and answers, of which only counts per piece are kept; visual identity, footage and media; anything
> about money; any password; and the person's conversations.
>
> Export writes the customer's object as Markdown and JSON. Closing an account deletes the customer's
> object, after its users are told. The server's logic is written against the same small SQL
> interface as the ledger, tested on Node's SQLite.

### Consequences

* Good, because isolation is structural: a request reaches only the objects it names, after the
  customer check.
* Good, because a customer's whole record is one object to export or delete.
* Bad, because a question across customers, such as how many pieces were posted last week, has no
  store to ask; it is answered by reading each customer's object in turn, or not at all.
* Bad, because drafts and their edits are kept for as long as the account is, and grow with use.

### Confirmation

Tests on Node's SQLite assert that no credential is returned by any read, that export contains every
record, and that deletion leaves nothing. The boundary check fails the build if any package depends
on a database client.

## Pros and Cons of the Options

### A Durable Object per customer and one per person, holding only CMOkit's own records

* Good, because it meets every driver.
* Bad, because a question across customers means reading every customer's object.

### One Cloudflare D1 database for every customer, each row keyed by customer

* Good, because questions across customers are one query.
* Bad, because isolation rests on every query's `WHERE` clause, so one missing clause leaks every
  customer, and export and deletion are queries across every table.

### A copy of each customer's events and guests, kept in step with the event platform

* Good, because results would read from CMOkit with no call to the platform.
* Bad, because CMOkit would hold attendees' personal data it does not need, and a copy goes stale the
  moment someone registers.

## More Information

Sources: Cloudflare's [Durable Objects pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/),
read through search extracts on 2026-10-30.

**Follow-on obligations.** The encryption key's entry in the deployment reference, and how it is
rotated. The tokens the issuer issues are kept by Cloudflare's OAuth library in Workers KV
(ADR-0035), not in these objects.

**Reversal cost.** Moderate: the logic stays behind its SQL interface, and another store needs an
adapter and a move of each customer's records.

## Revisit when

* Questions across customers are asked every week.
* One customer's object nears a Durable Object's storage limit.
* A customer asks for its drafts to be deleted after a period.
