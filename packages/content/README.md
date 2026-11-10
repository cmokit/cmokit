# @cmokit/content

The content server, as a Cloudflare Worker. It is the remote MCP server behind the `cmokit-content`
plugin: it serves the plugin's one hosted address at `/mcp`, as the customer chosen at sign-in, and
each customer's own path, `/customers/<slug>/mcp`; each customer has a Durable Object of its own
that keeps the brand context's versions, the promotable things, the pieces with their tracked links
and signals, and the customer's sealed connections. It runs no model; every model step runs in the
person's own Claude.

- **Tools:** `account_status`, `brand_read`, `brand_change`, `brand_history`, `offers_list`,
  `piece_save`, `pieces_list` and `results_read`, over Streamable HTTP with no session.
- **Sign-in:** it checks bearer tokens issued for its own audience by CMOkit's issuer, which it
  names in its Protected Resource Metadata, and issues none. A person must be a user of the customer
  the path names, or, at `/mcp`, of the customer their sign-in chose.
- **Connections:** a calendar key is entered on a one-time page of the server's own, never in the
  chat, checked with the platform, and kept sealed with AES-GCM.
- **Tracked links:** each piece's link is its destination with `utm_source`, `utm_medium`,
  `utm_campaign` (the promoted thing) and `utm_content` (the piece).
- **Results:** registrations, check-ins and revenue per piece are read from Luma by `utm_content`.
  No guest's name or address is kept or returned.
- **Export and erase:** everything a customer has, as JSON and Markdown, and deleted on request.

A deployment's Worker:

```ts
import { createContentWorker, issuerTokens } from '@cmokit/content/worker';

const { worker, Customer, Access } = createContentWorker({ tokens: issuerTokens });

export { Customer, Access };
export default worker;
```

`issuerTokens` checks each token with `@cmokit/issuer`'s Worker over the `ISSUER` service binding.
`Access` is the entrypoint the lifecycle's `PRODUCT` binding names, which makes a customer at its
first checkout and gives or revokes its access (ADR-0017). A person whose proven email address is
in `ACTIVATED_EMAILS` is made a customer of their own at their first call, with no checkout. The
Worker's bindings, variables and secrets are in the
[deployment reference](../../docs/reference/deployment.md).
