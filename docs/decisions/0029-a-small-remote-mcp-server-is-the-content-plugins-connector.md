---
status: "proposed"
kind: "requirement-driven"
date: 2026-11-08
decision-makers: [Geoff]
---

# ADR-0029: A small remote MCP server, at one address the plugin declares, is the content plugin's connector, and checks tokens it does not issue

**Requirements served:** `HST-04`, `HST-05`, `HST-09`, `HST-10`, `HST-11`, `CNT-07`, `CNT-09`, `CNT-11`, `CNT-12`, `CNT-17`, `CNT-19`, `CNT-22`.

## Context and Problem Statement

The content skill runs in the person's own Claude (ADR-0021). Some of what content needs is beyond
what Claude's own features hold reliably: a brand context read in every conversation, with versions
(ADR-0023); signals kept with each piece across conversations (`CNT-07`, ADR-0025); a record of what
was posted (`CNT-17`); events and registrations read from an event platform with a key that must not
pass through the conversation (`CNT-11`, `HST-04`); and results read weekly per piece (`CNT-19`). The
person's Claude reaches CMOkit through an authorization the person grants by signing in (`HST-05`),
issued by CMOkit's own issuer (ADR-0018), on the web and on a phone (`CNT-22`). Nothing done for one
customer reaches another's records (`HST-10`), and self-hosters run the same server (`HST-11`).

What Claude and the MCP specification offer, from their documentation: claude.ai connects to remote
MCP servers on every plan (one custom connector on Free), added on the web or desktop and then
available on iOS and Android. It prefers Streamable HTTP, and a tool call has 240 seconds. The current
MCP specification, 2026-07-28, requires a server to publish Protected Resource Metadata naming its
authorization server, and to check that each token was issued for it. Cloudflare's `createMcpHandler`
serves MCP statelessly from a Worker, and its `McpAgent` is deprecated. Cloudflare's OAuth library,
from its 1.0 release, can run the authorization server and the resource server as separate Workers,
the shape it recommends, the resource server checking tokens over a service binding.

## Decision Drivers

* Each tool earns its place: it does something Claude's own features cannot do reliably.
* No credential or third party's personal data passes through the conversation (`HST-04`).
* Works in claude.ai on every surface, with the authorization Claude already speaks (`HST-05`).
* Stateless and scales to zero, on Cloudflare, with no model (`HST-09`).
* Setup is as easy as it can be for a person who is not technical: the hosted service comes first,
  and installing the plugin and signing in is all it takes to connect.
* The server, not the model, holds which customer a conversation is about (`HST-10`).
* The server checks tokens and issues none, so the issuer can change without it.

## Considered Options

* A remote MCP server: a stateless Worker on Streamable HTTP, at one address the plugin declares,
  finding the customer from the person signed in, checking tokens from a separate issuer, with eight
  tools
* The same, with the MCP server also issuing its own tokens
* The same, with one address per customer, which the person adds as a custom connector
* The same, on one address, with every tool always taking the customer as an argument
* No MCP server in v1: the skill alone, with the brand context in a Claude Project and results read
  from the event platform's own connector or a file the person uploads
* A remote MCP server with a tool for every step of the workflow, the check and link-building
  included
* The engine's local MCP server, `cmokit mcp`, extended for content

## Decision Outcome

Chosen option: "A remote MCP server: a stateless Worker on Streamable HTTP, at one address the plugin
declares, finding the customer from the person signed in, checking tokens from a separate issuer, with
eight tools", because it holds exactly what Claude's own features cannot, connects with no address to
copy, and leaves sign-in to the issuer.

> The content server is a Worker serving MCP over Streamable HTTP, through Cloudflare's stateless
> handler, with no session, at one address, `/mcp`. The content plugin declares the hosted address,
> so a person who installs the plugin connects by signing in, with nothing to paste. Hosted, it runs
> on CMOkit's account; self-hosted, on the deployer's, from the same package, and a self-hoster adds
> theirs as a custom connector.
>
> The server finds the customer a call is for from the person signed in: it asks the issuer which
> customers the person is a user of (ADR-0030), then checks with that customer's own records, which
> are the authority. The hosted service gives each customer one user (ADR-0030), so nearly everyone
> has one customer and never names it. Every tool also takes an optional `customer`: a person who is
> a user of several must name one, and a call without it is refused with the list, so the model asks
> the person instead of guessing. Naming a customer the person is not a user of is refused. The
> one-time pages for connecting a calendar (ADR-0019) stay under the customer's own path, since a
> person only ever opens them from a link.
>
> The content server issues no token. It publishes Protected Resource Metadata naming the issuer,
> answers a call without a token by pointing at it, and accepts only tokens the issuer issued for
> the server's own audience. It reads two settings, the issuer's address and that audience, and
> checks tokens, and which customers a person is a user of, through one interface, whose adapter for
> CMOkit's own issuer (ADR-0018) is the library's resource server, run in the content server's own
> Worker and asking the issuer over a service binding; no third Worker is involved. A token names a
> person; every tool call checks that the person is a user of the customer it acts for.
>
> Its tools:
>
> | Tool | What only it can do |
> |---|---|
> | `account_status` | This customer's connections and subscription, and one-time links to connect, pay, export or close (ADR-0019) |
> | `brand_read` | The current brand context and its version (ADR-0023) |
> | `brand_change` | Saves a change the person approved, or restores an earlier version, as a new version with its reason and signals |
> | `brand_history` | Every version, with when, why and its signals |
> | `offers_list` | What is being sold: offers in the brand context and upcoming events read from the event platform (ADR-0032) |
> | `piece_save` | Records a piece as it is planned, drafted, approved, rejected, edited or posted, and the numbers the person reports for it, and returns its tracked links (ADR-0031) |
> | `pieces_list` | Pieces by week, status, format or audience |
> | `results_read` | Results per piece, format and audience for a period: conversions and revenue read from the destination through an adapter where one exists (the event platform, and a site's analytics for a page the engine serves, ADR-0036), with the conversions, revenue and attention the person reported; never a guest's personal data |
>
> The server's instructions tell the model to read the brand context before writing, never to accept
> a credential in the conversation, and, if the content skill is not loaded, how to turn it on.

### Consequences

* Good, because the server holds only state and keys, so it runs no model and costs storage and
  requests.
* Good, because guests' names and emails stay between the event platform and CMOkit; the model sees
  counts.
* Good, because connecting is installing the plugin and signing in: no address to find or paste.
* Good, because a call can never act on a customer the person is not a user of, whatever the model
  says.
* Bad, because a person who works for several customers names one on each call, and a model that
  names the wrong one of theirs acts on it; the refusal without a name makes it ask first.
* Bad, because a person on the Free plan who already has a custom connector cannot add CMOkit's.
* Neutral, because tools are named for the job, so another chat client that speaks MCP can use them.

### Confirmation

Tests drive each tool over Streamable HTTP with tokens for people of different customers and assert
that each reaches only their own customer, that a person with several is refused until they name one,
that naming another's customer is refused, that the customer's own list of users overrules the
issuer's index, refusal of a token issued for another audience, that no
tool's input accepts a credential, and that no result carries a guest's email or name. The connector
directory's requirement that each tool carry a `title` and a read-only or destructive hint is checked
in the tests too.

## Pros and Cons of the Options

### A remote MCP server: a stateless Worker on Streamable HTTP, at one address the plugin declares, finding the customer from the person signed in, checking tokens from a separate issuer, with eight tools

* Good, because it meets every driver.
* Bad, because a person with several customers names one on every call.

### The same, with the MCP server also issuing its own tokens

* Good, because there is one Worker instead of two.
* Bad, because sign-in and content become one deployment, so changing the issuer changes the content
  server, and any later server of CMOkit's would need a sign-in of its own.

### The same, with one address per customer, which the person adds as a custom connector

* Good, because a call can only ever act on the customer its address names.
* Bad, because every person finds and pastes an address of their own, which is the hardest step of
  setup for someone who is not technical, and the plugin can declare no address.
* Bad, because a person with two customers adds and switches between two connectors.

### The same, on one address, with every tool always taking the customer as an argument

* Good, because a person with several customers keeps one connector.
* Bad, because the model names the customer on every call, even for the many people who have only
  one, so one wrong guess acts on the wrong customer's records.

### No MCP server in v1: the skill alone, with the brand context in a Claude Project and results read from the event platform's own connector or a file the person uploads

* Good, because nothing is hosted, so it ships soonest and costs nothing, and a tracked link is only
  a URL with parameters the skill can write.
* Bad, because the person copies every approved brand context change into the project by hand, and
  nothing keeps its versions or the signals behind them (`CNT-09`).
* Bad, because registrations reach the model with guests' names and emails, and counting them per
  piece is left to the model.

### A remote MCP server with a tool for every step of the workflow, the check and link-building included

* Good, because every step would be visible in the server's logs.
* Bad, because planning, writing and checking are model work, which the server cannot do without
  inference (`HST-09`); as tools they would only pass text through.

### The engine's local MCP server, `cmokit mcp`, extended for content

* Good, because the server already exists.
* Bad, because a local server is ignored in claude.ai's chat, and it reads keys from a shell the
  person does not have.

## More Information

Sources: Anthropic's [custom connectors](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp),
[connectors on mobile](https://support.claude.com/en/articles/11176164-use-connectors-to-extend-claude-s-capabilities),
[building connectors](https://claude.com/docs/connectors/building) and
[directory submission](https://claude.com/docs/connectors/building/submission), read on 2026-10-30;
the MCP specification's [authorization, 2026-07-28](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization)
and [changelog](https://modelcontextprotocol.io/specification/2026-07-28/changelog); Cloudflare's
[remote MCP server guide](https://developers.cloudflare.com/agents/model-context-protocol/guides/remote-mcp-server/),
[McpAgent](https://developers.cloudflare.com/agents/model-context-protocol/apis/agent-api/) and
[workers-oauth-provider 1.0](https://developers.cloudflare.com/changelog/post/2026-10-01-workers-oauth-provider-1x/),
with the library's [README](https://github.com/cloudflare/workers-oauth-provider) and
[storage schema](https://github.com/cloudflare/workers-oauth-provider/blob/main/storage-schema.md).
The MCP authorization page, the Cloudflare pages and the library's README and storage schema were
read directly on 2026-11-06; the MCP changelog was not read again, and stands as read through a
search extract on 2026-10-30. The library's access tokens are not JWTs: each is
`{userId}:{grantId}:{random-secret}`, kept only as a hash in the issuer's store, so another resource
server checks one only by asking the issuer, and the adapter for an issuer other than CMOkit's own is
written when one is wanted. Which MCP protocol
versions claude.ai sends was not found. An earlier version of this record gave each
customer its own address, after CFOKit's [record on agent connections](https://github.com/cfokit/cfokit/blob/main/docs/decisions/0067-an-agent-connection-serves-one-company.md);
it was changed on 2026-11-08 because the hosted service comes first and gives each customer one user,
so an address per customer made every person's setup harder to protect a case few have.

**Follow-on obligations.** A package for the content server, which CLAUDE.md's list of packages does
not yet name; the server's entries in the deployment reference; a listing in Anthropic's connector
directory, if wanted, with its privacy policy and test account.

**Reversal cost.** Moderate: the tools are an interface the skill depends on, so changing them changes
the skill in step.

## Revisit when

* Claude documents a store a skill can read and write in any conversation, so some tools can go.
* A tool goes unused across customers for a quarter.
* Many people work for several customers, so naming one on every call becomes a burden.
