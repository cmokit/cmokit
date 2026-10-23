// The site's edge: a Cloudflare Worker routed in front of the site's domain.
import { createWorker } from '@cmokit/edge/worker';

export default createWorker();
