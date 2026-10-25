# @cmokit/cli

A CMOkit site's configuration: `defineConfig` for its `cmokit.config.ts`, which is bundled into the
edge when it is deployed. Each experiment declares its goal and its status: `draft`, `running` or
`ended`. Only a running experiment assigns visitors.

```ts
import { defineConfig } from '@cmokit/cli';

export default defineConfig({
  analytics: { posthog: { key: 'phc_…' } },
  experiments: [{
    flag: 'landing', path: '/', variants: { b: '/variants/landing/b/' },
    goal: 'signup', status: 'running',
  }],
});
```

The `cmokit` command is not here yet.

Part of [CMOkit](https://github.com/cmokit/cmokit), an opinionated, open-source growth engine for
subscription businesses.
