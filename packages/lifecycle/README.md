# @cmokit/lifecycle

The lifecycle, as a Cloudflare Worker. It sends each lead the sequence of messages a CMOkit site
declares in its `cmokit.config.ts`. Each lead's place in its sequence is kept in a Durable Object of
its own, and email is sent through SendGrid. The Worker has no route of its own; the edge reaches it
through a service binding.

- **Capture:** a form marked `data-cmokit-convert="<event>"` with an email field captures the
  visitor as a lead into the sequence that event starts.
- **Ending a sequence:** it ends at one of the sequence's `stop` events, an unsubscribe, or
  SendGrid's report of a bounce, a drop or a spam complaint. An event delivered twice acts once.
- **Unsubscribing:** every message carries a one-click unsubscribe (RFC 8058) that the edge serves,
  and belongs to the site's SendGrid unsubscribe group.
- **Analytics:** every send, delivery, open, click and unsubscribe is recorded in PostHog under the
  visitor's id, with the variant and channel the lead came from.
- **Privacy:** a lead's address is forgotten once its sequence ends.

A site's lifecycle Worker:

```ts
import { createLifecycleWorker } from '@cmokit/lifecycle/worker';
import config from '../cmokit.config.ts';
import messages from '../messages/index.ts';

const { worker, Lead } = createLifecycleWorker(config, messages);

export { Lead };
export default worker;
```

Each message is `messages/<template>.md`, a markdown file with a `subject` in its front matter.
`npm create cmokit` sets all of this up.

Part of [CMOkit](https://github.com/cmokit/cmokit), an opinionated, open-source growth engine for
subscription businesses.
