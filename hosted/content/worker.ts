// Hosted CMOkit's content server (ADR-0016, ADR-0029): the open-source content server, deployed to
// CMOkit's own Cloudflare account by the deploy-hosted workflow. `Access` is what the billing
// lifecycle's PRODUCT binding names (ADR-0004, ADR-0017).
import { createContentWorker, issuerTokens } from '@cmokit/content/worker';

const { worker, Customer, Access } = createContentWorker({ tokens: issuerTokens });

export { Customer, Access };
export default worker;
