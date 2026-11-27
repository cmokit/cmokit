# @cmokit/issuer

CMOKit's issuer, as a Cloudflare Worker: the sign-in a person's Claude sends them to when it
connects to the content server (ADR-0018). It keeps no password.

- **Ways in:** a six-digit code by email, Google, GitHub or Meta. A code works for ten minutes and
  five tries. Each way in belongs to one person, and a person has one email address. A sign-in at a
  provider whose email address a person has proven joins that person.
- **Routing:** the content plugin declares one hosted address, and signing in routes the person to
  their customer (ADR-0029). With one customer the sign-in finishes; with several the person
  chooses; with none it says so and issues nothing. The token names the person and that customer.
- **Clients:** Claude, by its Client ID Metadata Document, or a client that registers dynamically.
  Every redirect a client names must be Claude's callback or a loopback address.
- **Protocol:** people, ways in, sessions, client registration, PKCE, codes and tokens are Better
  Auth's, kept in a D1 database with tokens hashed (ADR-0035). Tokens are issued for one audience,
  the content server's.

A deployment's Worker:

```ts
import { createIssuerWorker } from '@cmokit/issuer/worker';

const { Issuer, Identity, Person } = createIssuerWorker();

export { Identity, Person };
export default Issuer;
```

The content server's Worker reaches it over a service binding named `ISSUER`. Its bindings,
variables and secrets are in the [deployment reference](../../docs/reference/deployment.md).
