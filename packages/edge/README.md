# @cmokit/edge

The edge, as a Cloudflare Worker in front of a CMOkit site, with the site's configuration bundled
into it. For a page under a running experiment it serves each visitor their variant at the page's
own address, assigned once by the experiments tool and kept in a cookie, and records the exposure.
It records conversions posted to `/_cmokit/convert` server-side, relays the browser's analytics
under the site's own address, and serves agents the control. Keeps no state.

```ts
// edge/worker.ts
import { createWorker } from '@cmokit/edge/worker';
import config from '../cmokit.config.ts';
export default createWorker(config);
```

Route the Worker on the site's own domain. `CMOKIT_ORIGIN` sets where the site is fetched from
when it is not that domain's origin.

Part of [CMOkit](https://github.com/cmokit/cmokit), an opinionated, open-source growth engine for
subscription businesses.
