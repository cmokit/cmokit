# cmokit-content

A plugin for Claude's chat, on the web, desktop and mobile, that plans, writes and checks one brand's
Reels, carousels, photo posts and Stories, reviews what worked each week, and reviews how the
brand's waitlist page converts, proposing one change at a time. It holds one skill,
`content`. Everything it keeps (the brand context, the pieces, their tracked links and results) lives
on CMOkit's content server, reached through CMOkit's connector, so every skill that serves the brand
reads the same context.

## What it needs

Set up on the web or the desktop app; everything after works on a phone.

| Needed | Where it is turned on |
|---|---|
| A plan with plugins (Pro, Max, Ultra, Team or Enterprise) | Your Claude plan |
| This plugin, added from this repository's marketplace | Customize, then Plugins, on the web or desktop |
| Code execution on | "Code execution and file creation" in Claude's settings |
| CMOkit's connector, signed in | Comes with the plugin; you sign in the first time a skill uses it |
| The brand's event calendar, connected once | The one-time link the skill gives you |
| For visuals: a Claude Design system, published as your default | Claude Design |
| Optional: a weekly scheduled task that runs the review | Any conversation |

The plugin declares CMOkit's hosted address, `https://mcp.cmokit.ai/mcp`, and signing in routes you
to your customer's records; if your account belongs to more than one customer, you choose which one
when you sign in. Add CMOkit to Claude by that address only: CMOkit's sign-in grants access to
`https://mcp.cmokit.ai/mcp`, so a customer's own path, `/customers/<slug>/mcp`, cannot sign in from Claude.
When something is missing, the skill says what and how to turn it on.

The decisions behind it are ADR-0021, ADR-0022, ADR-0024, ADR-0025, ADR-0029, ADR-0034 and ADR-0050.
