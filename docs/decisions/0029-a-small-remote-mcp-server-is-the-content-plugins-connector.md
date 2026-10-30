---
status: "draft"
kind: "requirement-driven"
date: 2026-10-30
decision-makers: [Geoff]
---

# ADR-0029: A small remote MCP server, one address per customer, is the content plugin's connector, and checks tokens it does not issue

**Requirements served:** `HST-04`, `HST-05`, `HST-07`, `HST-09`, `HST-10`, `HST-11`, `CNT-07`, `CNT-09`, `CNT-11`, `CNT-12`, `CNT-17`, `CNT-19`, `CNT-22`.

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
from its 1.0 release, runs the authorization server and the resource server as separate Workers, the
resource server checking tokens over a service binding.

## Decision Drivers

* Each tool earns its place: it does something Claude's own features cannot do reliably.
* No credential or third party's personal data passes through the conversation (`HST-04`).
* Works in claude.ai on every surface, with the authorization Claude already speaks (`HST-05`).
* Stateless and scales to zero, on Cloudflare, with no model (`HST-09`).
* The server, not the model, holds which customer a conversation is about (`HST-10`).
* The server checks tokens and issues none, so the issuer can change without it.

## Considered Options

* A remote MCP server: a stateless Worker on Streamable HTTP, one address per customer, checking
  tokens from a separate issuer, with nine tools
* The same, with the MCP server also issuing its own tokens
* The same, on one address, with every tool taking the customer as an argument
* No MCP server in v1: the skill alone, with the brand context in a Claude Project and results read
  from the event platform's own connector or a file the person uploads
* A remote MCP server with a tool for every step of the workflow, the check and link-building
  included
* The engine's local MCP server, `cmokit mcp`, extended for content

## Decision Outcome

Chosen option: "A remote MCP server: a stateless Worker on Streamable HTTP, one address per customer,
checking tokens from a separate issuer, with nine tools", because it holds exactly what Claude's own
features cannot, knows which customer it serves from its address, and leaves sign-in to the issuer.

> The content server is a Worker serving MCP over Streamable HTTP, through Cloudflare's stateless
> handler, with no session. Each customer has its own address, `/customers/<slug>/mcp`, and a
> connection serves that customer alone; a person with two customers adds two connectors, one named
> for each. Hosted, it runs on CMOkit's account; self-hosted, on the deployer's, from the same
> package. The content plugin declares the hosted address; a self-hoster adds theirs as a custom
> connector.
>
> The content server issues no token. It publishes Protected Resource Metadata naming the issuer,
> answers a call without a token by pointing at it, and accepts only tokens the issuer issued for the
> server's own audience. It reads two settings, the issuer's address and that audience, and checks
> tokens through one interface, whose adapter for CMOkit's own issuer (ADR-0018) is the library's
> resource server. A token names a person; every call checks that the person is a user of the
> customer the address names.
>
> Its tools:
>
> | Tool | What only it can do |
> |---|---|
> | `account_status` | This customer's connections and subscription, the addresses of the person's other customers, and one-time links to connect, pay, export or close (ADR-0019) |
> | `brand_read` | The current brand context and its version (ADR-0023) |
> | `brand_change` | Saves a change the person approved, or restores an earlier version, as a new version with its reason and signals |
> | `brand_history` | Every version, with when, why and its signals |
> | `offers_list` | What is being sold: offers in the brand context and upcoming events read from the event platform (ADR-0032) |
> | `piece_save` | Records a piece as it is planned, drafted, approved, rejected, edited or posted, and returns its tracked links (ADR-0031) |
> | `pieces_list` | Pieces by week, status, format or audience |
> | `results_read` | Results per piece, format and audience for a period, counted from the event platform and from analytics where present; never a guest's personal data |
> | `site_publish` | Publishes approved files to the connected site, or undoes a publish (ADR-0020) |
>
> The server's instructions tell the model to read the brand context before writing, never to accept
> a credential in the conversation, and, if the content skill is not loaded, how to turn it on.

### Consequences

* Good, because the server holds only state and keys, so it runs no model and costs storage and
  requests.
* Good, because guests' names and emails stay between the event platform and CMOkit; the model sees
  counts.
* Good, because a call can never act on a customer other than the one its address names, whatever
  the model says.
* Bad, because a person who works for two customers adds and switches between two connectors.
* Bad, because a person on the Free plan who already has a custom connector cannot add CMOkit's.
* Neutral, because tools are named for the job, so another chat client that speaks MCP can use them.

### Confirmation

Tests drive each tool over Streamable HTTP with tokens for people of different customers and assert
refusal at another customer's address, refusal of a token issued for another audience, that no
tool's input accepts a credential, and that no result carries a guest's email or name. The connector
directory's requirement that each tool carry a `title` and a read-only or destructive hint is checked
in the tests too.

## Pros and Cons of the Options

### A remote MCP server: a stateless Worker on Streamable HTTP, one address per customer, checking tokens from a separate issuer, with nine tools

* Good, because it meets every driver.
* Bad, because a person with several customers keeps several connectors.

### The same, with the MCP server also issuing its own tokens

* Good, because there is one Worker instead of two.
* Bad, because sign-in and content become one deployment, so changing the issuer changes the content
  server, and any later server of CMOkit's would need a sign-in of its own.

### The same, on one address, with every tool taking the customer as an argument

* Good, because a person with several customers keeps one connector.
* Bad, because the model names the customer on every call, so one wrong guess acts on the wrong
  customer's records; the address puts that choice with the person, once.

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
[workers-oauth-provider 1.0](https://developers.cloudflare.com/changelog/post/2026-10-01-workers-oauth-provider-1x/).
The MCP and Cloudflare pages were read through search extracts. Whether the library's access tokens
are JWTs another resource server could check by the issuer's published keys was not confirmed, so the
adapter for an issuer other than CMOkit's own is written when one is wanted. Which MCP protocol
versions claude.ai sends was not found. A connection per customer, named in its address, follows
CFOKit's [record on agent connections](https://github.com/cfokit/cfokit/blob/main/docs/decisions/0067-an-agent-connection-serves-one-company.md).

**Follow-on obligations.** A package for the content server, which CLAUDE.md's list of packages does
not yet name; the server's entries in the deployment reference; a listing in Anthropic's connector
directory, if wanted, with its privacy policy and test account.

**Reversal cost.** Moderate: the tools are an interface the skill depends on, so changing them changes
the skill in step.

## Revisit when

* Claude documents a store a skill can read and write in any conversation, so some tools can go.
* A tool goes unused across customers for a quarter.
* People with several customers find switching connectors a burden.
