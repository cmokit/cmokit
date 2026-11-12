// The issuer's pages. Everything shown that came from a client, a provider or a form is escaped, and
// no page may be framed or cached. Every page wears CMOkit's own look (ADR-0046).

import { HEADER, LOOK } from './look.ts';

const escape = (value: string) => value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

function page(title: string, body: string, status = 200, headers = new Headers()): Response {
  headers.set('content-type', 'text/html; charset=utf-8');
  headers.set('cache-control', 'no-store');
  headers.set('content-security-policy', "font-src 'self'; frame-ancestors 'none'");
  headers.set('x-frame-options', 'DENY');
  headers.set('referrer-policy', 'no-referrer');
  return new Response(`<!doctype html>
<html lang="en">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(title)}</title>
<style>${LOOK}</style>
<body>
${HEADER}
<h1>${escape(title)}</h1>
${body}
</body>
</html>`, { status, headers });
}

export interface ClientFacts {
  clientName: string;
  clientDomain?: string;
  redirectHost: string;
  redirectIsLoopback: boolean;
}

export function signInPage(options: {
  client: ClientFacts;
  handle: string;
  ways: { name: string; label: string }[];
  email: boolean;
  problem?: string;
  headers: Headers;
}): Response {
  const { client, handle } = options;
  const who = client.clientDomain
    ? `${escape(client.clientName)}, from <strong>${escape(client.clientDomain)}</strong>,`
    : `${escape(client.clientName)} (this app named itself, so its name isn't verified)`;
  const ways = options.ways.map((w) => `<button name="way" value="${escape(w.name)}">Continue with ${escape(w.label)}</button>`).join('\n');
  const email = options.email ? `<label for="address">Or get a code by email</label>
<input id="address" name="address" type="email" autocomplete="email" placeholder="you@example.com">
<button name="way" value="email" class="primary">Email me a code</button>` : '';
  return page('Sign in to CMOkit', `${options.problem ? `<p class="problem">${escape(options.problem)}</p>` : ''}
<p>${who} is asking to use CMOkit as you. Access goes to <strong>${escape(client.redirectHost)}</strong>.</p>
${client.redirectIsLoopback ? '<p><strong>This sends access to an app on your computer.</strong> Continue only if you just started connecting from it.</p>' : ''}
<form method="post" action="/authorize">
<input type="hidden" name="handle" value="${escape(handle)}">
${ways}
${email}
<button name="way" value="cancel">Cancel</button>
</form>
<p class="note">Signing in tells CMOkit who you are and nothing else. CMOkit keeps no password.</p>`, options.problem ? 400 : 200, options.headers);
}

export function codePage(options: { address: string; state: string; problem?: string; headers: Headers }): Response {
  return page('Enter your code', `${options.problem ? `<p class="problem">${escape(options.problem)}</p>` : ''}
<p>We sent a six-digit code to <strong>${escape(options.address)}</strong>. It works for ten minutes.</p>
<form method="post" action="/code?state=${encodeURIComponent(options.state)}">
<input name="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" required autofocus>
<button class="primary">Sign in</button>
</form>`, options.problem ? 400 : 200, options.headers);
}

/** What a person sees for a brand they never named, such as the first one made when they were activated. */
export const UNNAMED_BRAND = 'Unnamed brand';

export function choosePage(options: { brands: { slug: string; name: string | null }[]; state: string; headers: Headers }): Response {
  const choices = options.brands.map((b, i) => `<label><input type="radio" name="customer" value="${escape(b.slug)}"${i === 0 ? ' checked' : ''}> ${escape(b.name ?? UNNAMED_BRAND)}</label>`).join('\n');
  return page('Which brand?', `<p>Your account has more than one CMOkit brand. This connection will serve the one you choose.</p>
<form method="post" action="/choose?state=${encodeURIComponent(options.state)}">
${choices}
<button class="primary">Continue</button>
</form>`, 200, options.headers);
}

export function problemPage(message: string, status = 400, headers = new Headers()): Response {
  return page("This sign-in can't go on", `<p>${escape(message)}</p><p class="note">Start again from the app you were connecting.</p>`, status, headers);
}
