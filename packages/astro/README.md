# @cmokit/astro

The Astro integration. It checks the site's CMOkit configuration, adds the analytics script to
every page, and records a conversion when a form marked `data-cmokit-convert="<event>"` is
submitted. The build fails if a draft or running experiment's page was not built.

```ts
// astro.config.ts
import { defineConfig } from 'astro/config';
import cmokit from '@cmokit/astro';
import config from './cmokit.config.ts';

export default defineConfig({ integrations: [cmokit(config)] });
```

Part of [CMOkit](https://github.com/cmokit/cmokit), an opinionated, open-source growth engine for
subscription businesses.
