# @cmokit/cli

A CMOkit site's configuration: `defineConfig` for its `cmokit.config.ts`, which the Astro
integration checks at build and publishes as the manifest the edge reads.

```ts
import { defineConfig } from '@cmokit/cli';

export default defineConfig({
  analytics: { posthog: { key: 'phc_…' } },
  experiments: [{ flag: 'landing', path: '/', variants: { b: '/variants/landing/b/' } }],
});
```

The `cmokit` command is not here yet.

Part of [CMOkit](https://github.com/cmokit/cmokit), an opinionated, open-source growth engine for
subscription businesses.
