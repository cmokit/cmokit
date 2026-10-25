// The site's lifecycle: a Cloudflare Worker that sends each lead the sequence of messages in
// cmokit.config.ts, with the configuration and the templates in messages/ bundled into it when it is
// deployed. It has no route of its own; the edge reaches it through a service binding.
import { createLifecycleWorker } from '@cmokit/lifecycle/worker';
import config from '../cmokit.config.ts';
import messages from '../messages/index.ts';

const { worker, Lead } = createLifecycleWorker(config, messages);

export { Lead };
export default worker;
