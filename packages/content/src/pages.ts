// The one-time pages: on one a person enters a key for a vendor that only issues keys (ADR-0019), and
// the key travels from the person's browser to the content server, never through a conversation; on
// another a user accepts the server's terms (ADR-0039). The account page shows a signed-in person their
// account (ADR-0041), where they add a brand and, for the waitlist's owner, activate people (ADR-0042).

import { SECTIONS, type BrandContext } from './customer.ts';

export function keyPage(page: { label: string; help: string; token: string; problem?: string }): Response {
  return html(`<h1>Connect ${escape(page.label)}</h1>
<p>${escape(page.help)}</p>
${page.problem ? `<p role="alert"><strong>${escape(page.problem)}</strong></p>` : ''}
<form method="post">
  <input type="hidden" name="t" value="${escape(page.token)}">
  <label for="key">${escape(page.label)} API key</label>
  <input id="key" name="key" type="password" autocomplete="off" required>
  <button type="submit">Connect</button>
</form>
<p>CMOkit checks the key with ${escape(page.label)}, keeps it encrypted for this account alone, and never shows it again.</p>`, page.problem ? 400 : 200);
}

export function donePage(label: string, calendar: string): Response {
  return html(`<h1>${escape(label)} is connected</h1>
<p>CMOkit can now read the calendar ${escape(calendar)}. Close this page and go back to Claude.</p>`, 200);
}

export function gonePage(): Response {
  return html('<h1>This link has expired</h1><p>It was already used, or is more than a few minutes old. Ask Claude for a new one.</p>', 410);
}

/** The one-time page on which a user accepts the server's terms (ADR-0039). */
export function termsPage(page: { url: string; version: string; token: string; problem?: string }): Response {
  return html(`<h1>CMOkit beta terms</h1>
<p>Before you use CMOkit, read <a href="${escape(page.url)}" target="_blank" rel="noopener noreferrer">the beta terms</a> (version ${escape(page.version)}).</p>
${page.problem ? `<p role="alert"><strong>${escape(page.problem)}</strong></p>` : ''}
<form method="post">
  <input type="hidden" name="t" value="${escape(page.token)}">
  <label><input type="checkbox" name="accept" value="yes" required style="display:inline;width:auto"> I have read and accept the beta terms.</label>
  <button type="submit">Accept</button>
</form>`, page.problem ? 400 : 200);
}

export function acceptedPage(): Response {
  return html('<h1>You accepted the beta terms</h1><p>Close this page and go back to Claude, and ask it to carry on.</p>', 200);
}

const SUBSCRIPTION = {
  started: ['Your trial has started', 'Close this page and go back to Claude, and ask it to carry on setting up.'],
  cancelled: ['No subscription was started', 'Nothing was charged. Close this page and go back to Claude whenever you are ready.'],
  managed: ['You are back from billing', 'Close this page and go back to Claude.'],
} as const;

/** Where the payment processor's hosted pages send the person back to. */
export function subscriptionPage(state: string): Response {
  const [title, text] = SUBSCRIPTION[state as keyof typeof SUBSCRIPTION] ?? SUBSCRIPTION.managed;
  return html(`<h1>${title}</h1><p>${text}</p>`, 200);
}

/** One person on a site's waitlist, as the account page lists it, ranked by referrals. */
export interface WaitlistEntry {
  email: string;
  joined: string;
  referrals: number;
  activated: string | null;
}

/** What the account page shows. Absent `customer` means the person is no customer's user yet. */
export interface AccountView {
  email: string | null;
  /** The line shown after a change made on the page. */
  notice?: string;
  customer?: {
    /** The brand's slug, the name it goes by when signing in and in settings. */
    slug: string;
    /** Whether the person can add another brand here. */
    addBrand: boolean;
    /** The bound site's waitlist, when this brand owns it. */
    waitlist?: WaitlistEntry[] | 'unavailable';
    access: string;
    connections: { vendor: string; name: string }[];
    missing: { label: string; link: string; optional: boolean }[];
    brand: { version: number; context: BrandContext; at: string | null };
    terms?: { accepted: boolean; version: string; url: string; link?: string };
    manage?: string;
  };
}

const ACCESS: Record<string, string> = { trial: 'Free trial', active: 'Active', lapsed: 'Lapsed: pay to reopen your records' };

/** A signed-in person's account (ADR-0041). It changes nothing; changes are made in Claude. */
export function accountPage(view: AccountView): Response {
  const who = `${view.notice ? `<p role="status"><strong>${escape(view.notice)}</strong></p>` : ''}<p>Signed in${view.email ? ` as ${escape(view.email)}` : ''}.</p>`;
  const signOut = '<form method="post" action="/signout"><button type="submit">Sign out</button></form>';
  const c = view.customer;
  if (!c) {
    return html(`<h1>Your CMOkit account</h1>${who}
<p>This account has no CMOkit subscription yet. Ask Claude to set CMOkit up, and come back here afterwards.</p>${signOut}`, 200);
  }
  const terms = c.terms ? `<h2>Beta terms</h2>
<p>${c.terms.accepted
    ? `You accepted <a href="${escape(c.terms.url)}" target="_blank" rel="noopener noreferrer">the beta terms</a>, version ${escape(c.terms.version)}.`
    : `You have not accepted <a href="${escape(c.terms.url)}" target="_blank" rel="noopener noreferrer">the beta terms</a> (version ${escape(c.terms.version)}) yet. <a href="${escape(c.terms.link ?? '')}">Read and accept them</a>.`}</p>` : '';
  const connected = c.connections.map((x) => `<li>${escape(x.vendor)}: ${escape(x.name)}</li>`);
  const missing = c.missing.map((m) => `<li>${escape(m.label)}${m.optional ? ' (optional)' : ''}: <a href="${escape(m.link)}">connect</a></li>`);
  const { version, context, at } = c.brand;
  const sections = SECTIONS.filter((s) => context.sections[s]).map((s) => `<h3>${escape(s.replace('_', ' '))}</h3><p>${escape(context.sections[s] ?? '')}</p>`);
  const offers = context.offers.map((o) => `<li>${escape(o.name)}</li>`);
  const brand = version === 0
    ? '<p>No brand context yet. Ask Claude to build it with you.</p>'
    : `<p>Version ${version}${at ? `, approved ${escape(at.slice(0, 10))}` : ''}.</p>${sections.join('\n')}${offers.length ? `<h3>Offers</h3><ul>${offers.join('')}</ul>` : ''}`;
  const brands = c.addBrand ? `<h2>Brands</h2>
<p>Each brand has its own brand context, connections and content, and after the beta its own subscription.</p>
<form method="post" action="/brands">
  <label for="brand-name">New brand's name</label>
  <input id="brand-name" name="name" maxlength="60" required>
  <button type="submit">Add a brand</button>
</form>` : '';
  const waitlist = c.waitlist === 'unavailable'
    ? '<h2>Beta waitlist</h2><p>The waitlist can\'t be read yet. The site\'s lifecycle needs a newer release.</p>'
    : c.waitlist ? `<h2>Beta waitlist</h2>
${c.waitlist.length ? `<p>${c.waitlist.length} on the waitlist, most referrals first. Activating someone emails them, and they can sign in and use CMOkit.</p>
<ul>${c.waitlist.map((w) => `<li>${escape(w.email)}, joined ${escape(w.joined.slice(0, 10))}, ${w.referrals} referral${w.referrals === 1 ? '' : 's'}: ${w.activated
    ? `activated ${escape(w.activated.slice(0, 10))}`
    : `<form method="post" action="/waitlist/activate"><input type="hidden" name="email" value="${escape(w.email)}"><button type="submit">Activate</button></form>`}</li>`).join('')}</ul>` : '<p>Nobody is on the waitlist yet.</p>'}` : '';
  return html(`<h1>Your CMOkit account</h1>${who}
<p>Brand: ${escape(c.slug)}.</p>
<p>Access: ${escape(ACCESS[c.access] ?? c.access)}.${c.manage ? ` <a href="${escape(c.manage)}">Manage your subscription</a>.` : ''}</p>
${terms}
<h2>Connections</h2>
${connected.length ? `<ul>${connected.join('')}</ul>` : '<p>Nothing connected yet.</p>'}
${missing.length ? `<p>Not connected yet:</p><ul>${missing.join('')}</ul>` : ''}
<h2>Brand context</h2>
${brand}
<p>To change your brand context or settings, ask Claude.</p>
<p><a href="/export">Download everything CMOkit holds for this brand</a></p>
${brands}
${waitlist}
${signOut}`, 200);
}

export function signedOutPage(): Response {
  return html('<h1>You are signed out</h1><p><a href="/">Sign in again</a></p>', 200);
}

function html(body: string, status: number): Response {
  return new Response(`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="no-referrer"><title>CMOkit</title>
<style>body{font:16px/1.5 system-ui,sans-serif;max-width:32rem;margin:2rem auto;padding:0 1rem}
input,button{font:inherit;display:block;width:100%;margin:.5rem 0;padding:.5rem;box-sizing:border-box}</style>
</head><body>${body}</body></html>`, {
    status,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
      'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'",
    },
  });
}

function escape(text: string): string {
  return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}
