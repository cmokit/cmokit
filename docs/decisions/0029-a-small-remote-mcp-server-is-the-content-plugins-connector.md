---
status: "draft"
kind: "requirement-driven"
date: 2026-10-30
decision-makers: [Geoff]
---

# ADR-0029: A small remote MCP server, on Streamable HTTP and OAuth 2.1, is the content plugin's connector

**Requirements served:** `HST-04`, `HST-05`, `HST-07`, `HST-09`, `HST-10`, `HST-11`, `CNT-07`, `CNT-09`, `CNT-11`, `CNT-12`, `CNT-17`, `CNT-19`, `CNT-22`.

## Context and Problem Statement

The content skill runs in the person's own Claude (ADR-0021). Some of what content needs is beyond
what Claude's own features hold reliably: a brand context read in every conversation, with versions
(ADR-0023); signals kept with each piece across conversations (`CNT-07`, ADR-0025); a record of what
was posted (`CNT-17`); events and registrations read from an event platform with a key that must not
pass through the conversation (`CNT-11`, `HST-04`); and results read weekly per piece (`CNT-19`). The
person's Claude reaches CMOkit through an authorization the person grants by signing in (`HST-05`),
on the web and on a phone (`CNT-22`), and self-hosters run the same server (`HST-11`).

What Claude and the MCP specification offer, from their documentation: claude.ai connects to remote
MCP servers on every plan (one custom connector on Free), added on the web or desktop and then
available on iOS and Android. It prefers Streamable HTTP. For OAuth it uses a Client ID Metadata
Document that Anthropic hosts when the authorization server advertises support for one, and falls
back to dynamic client registration; its redirect URI is `https://claude.ai/api/mcp/auth_callback`,
PKCE with S256 is required, and a tool call has 240 seconds. The current MCP specification,
2026-07-28, requires Protected Resource Metadata, recommends Client ID Metadata Documents, and
deprecates dynamic client registration. Cloudflare's `createMcpHandler` serves MCP statelessly from a
Worker, and its `McpAgent` is deprecated. Cloudflare's OAuth library makes a Worker an OAuth 2.1
authorization server, keeping hashed tokens and encrypted grants in Workers KV.

## Decision Drivers

* Each tool earns its place: it does something Claude's own features cannot do reliably.
* No credential or third party's personal data passes through the conversation (`HST-04`).
* Works in claude.ai on every surface, with the authorization Claude already speaks (`HST-05`).
* Stateless and scales to zero, on Cloudflare, with no model (`HST-09`).
* Every call is for one customer the person belongs to (`HST-10`).

## Considered Options

* A remote MCP server: a stateless Worker on Streamable HTTP, with CMOkit as the OAuth 2.1
  authorization server and nine tools
* No MCP server in v1: the skill alone, with the brand context in a Claude Project and results read
  from the event platform's own connector or a file the person uploads
* A remote MCP server with a tool for every step of the workflow, the check and link-building
  included
* The engine's local MCP server, `cmokit mcp`, extended for content

## Decision Outcome

Chosen option: "A remote MCP server: a stateless Worker on Streamable HTTP, with CMOkit as the OAuth
2.1 authorization server and nine tools", because it holds exactly what Claude's own features cannot,
behind the authorization claude.ai already uses.

> The content server is a Worker serving MCP over Streamable HTTP at `/mcp`, through Cloudflare's
> stateless handler, with no session. Hosted, it runs on CMOkit's account; self-hosted, on the
> deployer's, from the same package. The content plugin declares the hosted address; a self-hoster
> adds theirs as a custom connector.
>
> The same Worker is the OAuth 2.1 authorization server, through Cloudflare's OAuth library. It
> publishes Protected Resource Metadata, accepts Client ID Metadata Documents and the `none` client
> authentication method, so Claude registers with its published identity, offers no dynamic
> registration, requires PKCE with S256, and checks each token's audience. Signing in at its consent
> step is CMOkit's sign-in (ADR-0018). A token names the person; every tool but the first takes the
> customer it acts for, checked against the person's memberships on every call.
>
> Its tools:
>
> | Tool | What only it can do |
> |---|---|
> | `account_status` | The person's customers, each one's connections and subscription, and one-time links to connect, pay, export or close (ADR-0019) |
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
* Bad, because Cloudflare's OAuth library keeps grants in Workers KV, while CLAUDE.md says Durable
  Objects are the only store; this record cannot be accepted until that rule is narrowed or the
  grants are kept in a Durable Object.
* Bad, because a person on the Free plan who already has a custom connector cannot add CMOkit's.
* Neutral, because tools are named for the job, so another chat client that speaks MCP can use them.

### Confirmation

Tests drive each tool over Streamable HTTP with tokens for two people of different customers and
assert refusal across customers, that no tool's input accepts a credential, and that no result
carries a guest's email or name. The connector directory's requirement that each tool carry a
`title` and a read-only or destructive hint is checked in the tests too.

## Pros and Cons of the Options

### A remote MCP server: a stateless Worker on Streamable HTTP, with CMOkit as the OAuth 2.1 authorization server and nine tools

* Good, because it meets every driver.
* Bad, because CMOkit runs an authorization server, with the care that takes.

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
[building connectors](https://claude.com/docs/connectors/building),
[connector authentication](https://claude.com/docs/connectors/building/authentication) and
[directory submission](https://claude.com/docs/connectors/building/submission), read on 2026-10-30;
the MCP specification's [authorization, 2026-07-28](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization)
and [changelog](https://modelcontextprotocol.io/specification/2026-07-28/changelog); Cloudflare's
[remote MCP server guide](https://developers.cloudflare.com/agents/model-context-protocol/guides/remote-mcp-server/),
[McpAgent](https://developers.cloudflare.com/agents/model-context-protocol/apis/agent-api/) and
[workers-oauth-provider](https://github.com/cloudflare/workers-oauth-provider). The MCP and Cloudflare
pages were read through search extracts. Which MCP protocol versions claude.ai sends was not found.

**Follow-on obligations.** A package for the content server, which CLAUDE.md's list of packages does
not yet name; the server's entries in the deployment reference; a listing in Anthropic's connector
directory, if wanted, with its privacy policy and test account.

**Reversal cost.** Moderate: the tools are an interface the skill depends on, so changing them changes
the skill in step.

## Revisit when

* Claude documents a store a skill can read and write in any conversation, so some tools can go.
* A tool goes unused across customers for a quarter.
* claude.ai stops falling back to dynamic registration, or another client CMOkit wants needs it.
