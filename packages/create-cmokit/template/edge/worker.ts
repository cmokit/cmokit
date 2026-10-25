// The site's edge: a Cloudflare Worker routed in front of the site's domain, with the site's CMOkit
// configuration bundled into it when it is deployed.
import { createWorker } from '@cmokit/edge/worker';
import config from '../cmokit.config.ts';

export default createWorker(config);
