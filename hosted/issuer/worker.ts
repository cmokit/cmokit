// Hosted CMOkit's issuer (ADR-0016, ADR-0018): the open-source issuer, deployed to CMOkit's own
// Cloudflare account by the deploy-hosted workflow. Its pages wear CMOkit's own look (ADR-0046).
import { createIssuerWorker } from '@cmokit/issuer/worker';
import { fonts } from '../fonts/fonts.ts';

const { Issuer, Identity, Person } = createIssuerWorker({ fonts });

export { Identity, Person };
export default Issuer;
