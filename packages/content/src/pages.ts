// The one-time pages: on one a person enters a key for a vendor that only issues keys (ADR-0019), and
// the key travels from the person's browser to the content server, never through a conversation; on
// another a user accepts the server's terms (ADR-0039). The account page shows a signed-in person their
// account (ADR-0041), where they add a brand (ADR-0042) and run the brand's waitlist (ADR-0043). Every
// page wears CMOkit's own look, shared with the sign-in pages (ADR-0046).

import { HEADER, LOOK } from '@cmokit/issuer/look';
import { SECTIONS, type BrandContext, type InstagramAccount, type WaitlistEntry } from './customer.ts';

export type { WaitlistEntry } from './customer.ts';

export function keyPage(page: { label: string; help: string; token: string; problem?: string }): Response {
  return html(`<h1>Connect ${escape(page.label)}</h1>
<p>${escape(page.help)}</p>
${page.problem ? `<p role="alert"><strong>${escape(page.problem)}</strong></p>` : ''}
<form method="post">
  <input type="hidden" name="t" value="${escape(page.token)}">
  <label for="key">${escape(page.label)} API key</label>
  <input id="key" name="key" type="password" autocomplete="off" required>
  <button type="submit" class="primary">Connect</button>
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
  <label><input type="checkbox" name="accept" value="yes" required> I have read and accept the beta terms.</label>
  <button type="submit" class="primary">Accept</button>
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
    /** Every brand the person is a user of, this one among them, with the name the person gave it. */
    brands: { slug: string; name: string | null }[];
    /** Whether the person can name this brand here. */
    rename: boolean;
    /** The brand's waitlist, ranked by referrals, and how a site joins it (ADR-0043). */
    waitlist?: {
      people: WaitlistEntry[];
      /** The site addresses whose pages may add people. */
      sites: string[];
      /** The form and script a site pastes into a page. */
      snippet: string;
      /** Whether activating someone on this list lets them use CMOkit itself, as on CMOkit's own brand. */
      grantsCmokit: boolean;
      /** The brand's own Instagram account, when an Instagram app is set up (ADR-0045); null until connected. */
      instagram?: InstagramAccount | null;
    };
    access: string;
    connections: { vendor: string; name: string }[];
    missing: { label: string; link: string; optional: boolean }[];
    brand: { version: number; context: BrandContext; at: string | null };
    terms?: { accepted: boolean; version: string; url: string; link?: string };
    manage?: string;
  };
}

const ACCESS: Record<string, string> = { trial: 'Free trial', active: 'Active', lapsed: 'Lapsed: pay to reopen your records' };

/** What a person sees for a brand they never named, such as the first one made when they were activated. */
export const UNNAMED_BRAND = 'Unnamed brand';

const brandName = (name: string | null): string => name ?? UNNAMED_BRAND;

/** The account page's three tabs, each at a path of its own, with the bottom tab bar between them. */
export type AccountTab = 'home' | 'waitlist' | 'account';

const TABS: { tab: AccountTab; path: string; label: string }[] = [
  { tab: 'home', path: '/', label: 'Home' },
  { tab: 'waitlist', path: '/waitlist', label: 'Waitlist' },
  { tab: 'account', path: '/account', label: 'Account' },
];

/**
 * A signed-in person's account (ADR-0041), as three tabs: Home is the brand, its access, terms,
 * connections and brand context; Waitlist is the brand's waitlist; Account is the person, their
 * brands, the export and signing out. Brand context and settings are changed in Claude.
 */
export function accountPage(view: AccountView, tab: AccountTab = 'home'): Response {
  const notice = view.notice ? `<p role="status">${escape(view.notice)}</p>` : '';
  const signedIn = `<p>Signed in${view.email ? ` as <strong>${escape(view.email)}</strong>` : ''}.</p>`;
  const signOut = '<form method="post" action="/signout"><button type="submit">Sign out</button></form>';
  const c = view.customer;
  if (!c) {
    return html(`<h1>Your CMOkit account</h1>${notice}${signedIn}
<p>This account has no CMOkit subscription yet. Ask Claude to set CMOkit up, and come back here afterwards.</p>${signOut}`, 200);
  }
  const name = brandName(c.brands.find((b) => b.slug === c.slug)?.name ?? null);
  const tabs = TABS.filter((t) => t.tab !== 'waitlist' || c.waitlist);
  const shown = tabs.some((t) => t.tab === tab) ? tab : 'home';
  const body = shown === 'waitlist' ? waitlistTab(c.waitlist!) : shown === 'account' ? accountTab(c, name, signedIn, signOut) : homeTab(c, name);
  const bar = `<nav class="tabs" aria-label="Account">${tabs.map((t) => `<a href="${t.path}"${t.tab === shown ? ' aria-current="page"' : ''}>${t.label}</a>`).join('')}</nav>`;
  return html(`${notice}${body}\n${bar}`, 200);
}

type Customer = NonNullable<AccountView['customer']>;

function homeTab(c: Customer, name: string): string {
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
  return `<h1>${escape(name)}</h1>
<p>Access: ${escape(ACCESS[c.access] ?? c.access)}.${c.manage ? ` <a href="${escape(c.manage)}">Manage your subscription</a>.` : ''}</p>
${terms}
<h2>Connections</h2>
${connected.length ? `<ul>${connected.join('')}</ul>` : '<p>Nothing connected yet.</p>'}
${missing.length ? `<p>Not connected yet:</p><ul>${missing.join('')}</ul>` : ''}
<h2>Brand context</h2>
${brand}
<p>To change your brand context or settings, ask Claude.</p>`;
}

function waitlistTab(w: NonNullable<Customer['waitlist']>): string {
  const person = (p: WaitlistEntry) => `<li><span class="row-main"><strong>${escape(p.email)}</strong><span class="note">${p.instagram ? `Instagram @${escape(p.instagram)}, commented on ${p.engaged} Reel${p.engaged === 1 ? '' : 's'}, ` : ''}joined ${escape(p.joined.slice(0, 10))}, ${p.referrals} referral${p.referrals === 1 ? '' : 's'}${cameFrom(p.source)}</span></span>${p.activated
    ? `<span class="badge">Activated ${escape(p.activated.slice(0, 10))}</span>`
    : `<form method="post" action="/waitlist/activate"><input type="hidden" name="email" value="${escape(p.email)}"><button type="submit">Activate</button></form>`}</li>`;
  return `<h1>Waitlist</h1>
<p>People join from a form on your site. Joining gives no access until you activate them.${w.grantsCmokit ? ' Activating someone here lets them sign in and use CMOkit.' : ''} CMOkit sends no email yet, so tell them yourself.</p>
${w.people.length ? `<p>${w.people.length} on the waitlist, ranked by referrals plus Reels commented on, then who joined first.</p>
<ul class="rows">${w.people.map(person).join('')}</ul>` : '<p>Nobody is on the waitlist yet.</p>'}
${w.instagram !== undefined ? `<h2>Instagram</h2>\n${instagramSection(w.instagram)}` : ''}
<h2>Your site</h2>
<form method="post" action="/waitlist/sites">
  <label for="waitlist-sites">Your site addresses, one per line</label>
  <textarea id="waitlist-sites" name="sites" rows="3">${escape(w.sites.join('\n'))}</textarea>
  <button type="submit">Save site addresses</button>
</form>
${w.sites.length ? `<p>Paste this into a page on ${w.sites.length === 1 ? 'that site' : 'those sites'}:</p>
<pre><code>${escape(w.snippet)}</code></pre>` : '<p>Add your site\'s address first, and the form to paste into it shows here.</p>'}`;
}

function accountTab(c: Customer, name: string, signedIn: string, signOut: string): string {
  const others = c.brands.filter((b) => b.slug !== c.slug);
  const listed = `<ul><li>${escape(name)} (shown on this page)</li>${others.map((b) => `<li>${escape(brandName(b.name))}</li>`).join('')}</ul>`
    + (others.length ? '<p><a href="/signin">Switch brand</a>: sign in again and choose the brand to show.</p>' : '')
    + (c.rename ? `<form method="post" action="/brands/name">
  <label for="brand-rename">Name of the brand shown on this page</label>
  <input id="brand-rename" name="name" maxlength="60" required value="${escape(c.brands.find((b) => b.slug === c.slug)?.name ?? '')}">
  <button type="submit">Rename</button>
</form>` : '');
  const brands = c.addBrand || c.rename || others.length ? `<h2>Brands</h2>
<p>Each brand has its own brand context, connections and content, and after the beta its own subscription.</p>
${listed}
${c.addBrand ? `<form method="post" action="/brands">
  <label for="brand-name">New brand's name</label>
  <input id="brand-name" name="name" maxlength="60" required>
  <button type="submit">Add a brand</button>
</form>` : ''}` : '';
  return `<h1>Account</h1>
${signedIn}
<p>Brand: ${escape(name)}.</p>
${brands}
<h2>Your data</h2>
<p><a href="/export">Download everything CMOkit holds for this brand</a></p>
${signOut}`;
}

export function signedOutPage(): Response {
  return html('<h1>You are signed out</h1><p><a href="/">Sign in again</a></p>', 200);
}

function html(body: string, status: number): Response {
  return new Response(`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="same-origin"><title>CMOkit</title>
<style>${LOOK}</style>
</head><body>
${HEADER}
${body}
</body></html>`, {
    status,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
      'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; font-src 'self'; form-action 'self'; frame-ancestors 'none'",
    },
  });
}

function escape(text: string): string {
  return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

/** Where a person on the waitlist came from, as the tracking tags of the page they joined on. */
function cameFrom(source: Record<string, string>): string {
  const tags = Object.entries(source);
  return tags.length ? `, came from ${tags.map(([name, value]) => `${escape(name)}=${escape(value)}`).join(' ')}` : '';
}

/** The brand's Instagram account on its account page: connect it, then count comments on its Reels. */
function instagramSection(account: InstagramAccount | null): string {
  if (!account) {
    return `<p>Connect your brand's Instagram business or creator account. People on your waitlist then comment their code on your Reels, and each Reel they comment on moves them up.</p>
<form method="post" action="/instagram/connect"><button type="submit">Connect Instagram</button></form>`;
  }
  const counted = account.counted
    ? `Last counted ${escape(account.counted.at.slice(0, 16).replace('T', ' '))} UTC: ${account.counted.people} ${account.counted.people === 1 ? 'person' : 'people'} on your waitlist commented on your last ${account.counted.reels} Reel${account.counted.reels === 1 ? '' : 's'}.`
    : 'Not counted yet.';
  return `<p>Instagram: @${escape(account.username)}. ${counted}</p>
<form method="post" action="/instagram/count"><button type="submit">Count comments on your Reels</button></form>`;
}
