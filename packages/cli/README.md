# @cmokit/cli

A CMOkit site's configuration: `defineConfig` for its `cmokit.config.ts`, which is bundled into the
edge when it is deployed. Each experiment declares its goal and its status: `draft`, `running` or
`ended`. Only a running experiment assigns visitors.

```ts
import { defineConfig } from '@cmokit/cli';

export default defineConfig({
  analytics: { posthog: { key: 'phc_…', project: 12345 } },
  experiments: [{
    flag: 'landing', path: '/', variants: { b: '/variants/landing/b/' },
    goal: 'signup', status: 'running',
  }],
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

Every command needs `analytics.posthog.project` in the configuration, and a PostHog personal API key
scoped to that project with `experiment:write`, `feature_flag:write`, `query:read` and `experiment_saved_metric:read`, in
`POSTHOG_PERSONAL_API_KEY`. The deploy supplies it to `sync` as a secret.

Part of [CMOkit](https://github.com/cmokit/cmokit), an opinionated, open-source growth engine for
subscription businesses.
