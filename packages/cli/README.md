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

It needs `analytics.posthog.project` in the configuration, and a PostHog personal API key scoped to
that project with `experiment:write` and `feature_flag:write`, which the deploy supplies as a secret.

Part of [CMOkit](https://github.com/cmokit/cmokit), an opinionated, open-source growth engine for
subscription businesses.
