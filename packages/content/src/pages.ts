// The one-time pages: on one a person enters a key for a vendor that only issues keys (ADR-0019), and
// the key travels from the person's browser to the content server, never through a conversation; on
// another a user accepts the server's terms (ADR-0039). The account page shows a signed-in person their
// account (ADR-0041), where they add a brand (ADR-0042) and run the brand's waitlist (ADR-0043); it is
// React, made by the package's build (ADR-0051), and this module wraps it in its page. Every page
// wears CMOkit's own look, shared with the sign-in pages (ADR-0046).

import { HEADER, LOOK } from '@cmokit/issuer/look';
import type { InstagramAccount, WaitlistEntry } from './customer.ts';

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
  /** The Instagram handle they signed in with, for a person who proved no address (ADR-0048). */
  handle?: string;
  /** The line shown after a change made on the page, as an error when the change failed. */
  notice?: { text: string; tone: 'info' | 'error' };
  /**
   * For a person nobody activated, where CMO Kit's waitlist is joined, or null when no site of its
   * is known; absent where a person subscribes instead.
   */
  join?: string | null;
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
    /** The approved brand context, its sections in their order, with titles to show. */
    brand: { version: number; at: string | null; sections: { title: string; text: string }[]; offers: string[] };
    terms?: { accepted: boolean; version: string; url: string; link?: string };
    manage?: string;
    /**
     * What the brand's setup shows as done beyond the brand context: Claude connected, a visit counted
     * on a page with the brand's form (ADR-0050), and a first piece planned; with the address Claude
     * connects to.
     */
    setup?: { claude: boolean; measured: boolean; planned: boolean; home: string; connector: string };
  };
}

/** The account page's three tabs, each at a path of its own, with the bottom tab bar between them. */
export type AccountTab = 'home' | 'waitlist' | 'account';

/**
 * The account page as the content package's build makes it (ADR-0051): React that renders a view to
 * HTML on the server, and the script and stylesheet that make the same view interactive in the
 * browser.
 */
export interface Portal {
  render(view: AccountView, tab: AccountTab): string;
  script: string;
  style: string;
}

/** The address the account page's script is served at, which changes whenever the script does. */
export function portalScript(portal: Portal): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < portal.script.length; i++) hash = Math.imul(hash ^ portal.script.charCodeAt(i), 0x01000193);
  return `/portal.js?v=${(hash >>> 0).toString(36)}`;
}

/**
 * A signed-in person's account (ADR-0041, ADR-0051), rendered on the server, with the view handed to
 * the page's script as data so the same page becomes interactive: Home is the brand, its setup,
 * access, terms, connections and brand context; Waitlist is the brand's waitlist; Account is the
 * person, their brands, the export and signing out. Every change still posts a form to the server.
 */
export function portalPage(portal: Portal, view: AccountView, tab: AccountTab): Response {
  // In a script element only "</" ends it early, so "<" is written as its escape.
  const data = JSON.stringify({ view, tab }).replace(/</g, '\\u003c');
  return new Response(`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="color-scheme" content="light dark"><meta name="referrer" content="same-origin"><title>CMO Kit</title>
<style>${portal.style}</style>
</head><body>
<div id="root">${portal.render(view, tab)}</div>
<script type="application/json" id="portal-view">${data}</script>
<script type="module" src="${portalScript(portal)}"></script>
</body></html>`, {
    status: 200,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
      // As the other pages, with the page's own script from this origin and nothing inline.
      'content-security-policy': "default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; font-src 'self'; form-action 'self' https://www.facebook.com; frame-ancestors 'none'; base-uri 'none'",
    },
  });
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
      // Connect Instagram posts to this origin, which answers with a redirect to Facebook's login, and a
      // browser holds a form's redirects to form-action too: without Facebook here, Chrome stops there.
      'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; font-src 'self'; form-action 'self' https://www.facebook.com; frame-ancestors 'none'",
    },
  });
}

function escape(text: string): string {
  return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}
