# cmokit-content

A plugin for Claude's chat, on the web, desktop and mobile, that plans, writes and checks one brand's
Reels, carousels, photo posts and Stories, and reviews what worked each week. It holds one skill,
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
| CMOkit's connector, at the address CMOkit gives your customer, signed in | Added as a custom connector |
| The brand's event calendar, connected once | The one-time link the skill gives you |
| For visuals: a Claude Design system, published as your default | Claude Design |
| Optional: a weekly scheduled task that runs the review | Any conversation |

Each customer has its own connector address, `/customers/<slug>/mcp` on CMOkit's server. The plugin
is to declare CMOkit's hosted address, and signing in routes you to your customer's; that address is
not set yet, so for now you add yours as a custom connector. When something is
missing, the skill says what and how to turn it on.

The decisions behind it are ADR-0021, ADR-0022, ADR-0024, ADR-0025, ADR-0029 and ADR-0034.
