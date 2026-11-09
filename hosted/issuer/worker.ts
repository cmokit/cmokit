// Hosted CMOkit's issuer (ADR-0016, ADR-0018): the open-source issuer, deployed to CMOkit's own
// Cloudflare account by the deploy-hosted workflow.
import { createIssuerWorker } from '@cmokit/issuer/worker';

const { Issuer, Identity, Person } = createIssuerWorker();

export { Identity, Person };
export default Issuer;
