// Hosted CMOkit's content server (ADR-0016, ADR-0029): the open-source content server, deployed to
// CMOkit's own Cloudflare account by the deploy-hosted workflow. `Access` is what the billing
// lifecycle's PRODUCT binding names (ADR-0004, ADR-0017). Its pages wear CMOkit's own look (ADR-0046),
// and its waitlist tools show the waitlist card the package's build makes (ADR-0049), bundled as text by
// the `Text` rule in wrangler.jsonc.
/// <reference path="./html.d.ts" />
import { createContentWorker, issuerTokens } from '@cmokit/content/worker';
import waitlist from '@cmokit/content/apps/waitlist.html';
import { fonts } from '../fonts/fonts.ts';

const { worker, Customer, Access } = createContentWorker({ tokens: issuerTokens, fonts, apps: { waitlist } });

export { Customer, Access };
export default worker;
