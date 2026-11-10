# @cmokit/cli

A CMOkit site's configuration: `defineConfig` for its `cmokit.config.ts`, which is bundled into the
edge and the lifecycle when they are deployed. Each experiment declares its goal and its status:
`draft`, `running` or `ended`. Only a running experiment assigns visitors. Each sequence declares
the event that captures a lead into it, the events that end it, and its messages, each a template
in `messages/` sent some time after the one before. A visit records the campaign parameters, any
the site names in `analytics.params` and its waitlist's referral parameter. A waitlist declares the
event that joins it, its activation message and the link that message gives.

```ts
import { defineConfig } from '@cmokit/cli';

export default defineConfig({
  analytics: { posthog: { key: 'phc_…', project: 12345 }, params: ['plan'] },
  experiments: [{
    flag: 'landing', path: '/', variants: { b: '/variants/landing/b/' },
    goal: 'signup', status: 'running',
  }],
  messaging: {
    from: 'hello@example.com', address: 'Company, street, city, country',
    sendgrid: { unsubscribeGroup: 12345 },
  },
  sequences: [{
    name: 'welcome', start: 'signup', stop: ['trial_started'],
    messages: [{ template: 'welcome', after: '0m' }, { template: 'follow-up', after: '3d' }],
  }],
  waitlist: { event: 'waitlist_joined', template: 'you-are-in', link: 'https://app.example.com/' },
});
```

## `cmokit experiments sync`

Makes the experiments tool match the configuration, and is run by the deploy after the edge is
deployed. For each experiment it creates a draft, with its flag and its goal, launches it when its
status becomes `running`, ends it when it becomes `ended`, and archives it when it is removed from
the configuration. It changes only experiments it created, and changes nothing if any experiment
cannot be made to match, such as a running one whose variants changed.

```
POSTHOG_PERSONAL_API_KEY=… npx cmokit experiments sync [--dry-run]
```

## `cmokit experiments plan`

Estimates how long each experiment that is not ended must run. It reads how many visitors reached
the experiment's page over the last weeks and what share of them sent its goal, and asks PostHog how
many visitors it needs to detect a given relative lift (`--effect`, in percent; PostHog's default
otherwise).

```
POSTHOG_PERSONAL_API_KEY=… npx cmokit experiments plan [<flag>] [--effect <percent>] [--json]
```

## `cmokit experiments results`

Reads each experiment's results on its goal, as PostHog computes them: for each variant, the
visitors exposed and converted and, against the control, the interval of its lift, its chance to
win (or p-value) and whether PostHog judges it significant.

```
POSTHOG_PERSONAL_API_KEY=… npx cmokit experiments results [<flag>] [--json]
```

## `cmokit waitlist`

Lists the site's waitlist, those who referred the most people first, then the earliest to join, and
activates a person on it, which sends them the activation message once. It reads the lifecycle's
`WAITLIST_KEY` from `CMOKIT_WAITLIST_KEY`, and sends it only to the site, over https.

```
CMOKIT_WAITLIST_KEY=… npx cmokit waitlist --site https://example.com [--json]
CMOKIT_WAITLIST_KEY=… npx cmokit waitlist activate ada@example.com --site https://example.com
```

## `cmokit mcp`

An MCP server on stdio, for an agent working on the site. Its tools are `experiments_plan` and
`experiments_results`, which answer as the commands above do, in words and as data, and
`experiments_preview_sync`, which says what the next deploy would change. None of them changes
anything: an agent starts or ends an experiment by changing its status in `cmokit.config.ts`, for a
person to approve. A site's `.mcp.json`:

```json
{ "mcpServers": { "cmokit": { "command": "npx", "args": ["cmokit", "mcp"] } } }
```

The server reads the key from the environment the agent was started in, so the key never passes
through the agent.

Every command but `waitlist` needs `analytics.posthog.project` in the configuration, and a PostHog personal API key
scoped to that project with `experiment:write`, `feature_flag:write`, `query:read` and `experiment_saved_metric:read`, in
`POSTHOG_PERSONAL_API_KEY`. The deploy supplies it to `sync` as a secret.

Part of [CMOkit](https://github.com/cmokit/cmokit), an opinionated, open-source growth engine for
subscription businesses.
