// The content server's pages wear CMOkit's own look, shared with the sign-in pages (ADR-0046), and
// the account page is React, rendered on the server and made interactive by its own script (ADR-0051).

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { HEADER, LOOK } from '@cmokit/issuer/look';
import { keyPage, portalPage, portalScript, termsPage, type AccountView } from '../src/pages.ts';
import { renderPortal } from '../apps/portal/render.tsx';
import { portal } from './fixtures.ts';

test('every one-time page carries the shared look under the wordmark, loads fonts only from its own origin, and styles no element on its own', async () => {
  const pages = [
    keyPage({ label: 'Luma', help: 'Find the key in Luma.', token: 't' }),
    termsPage({ url: 'https://example.com/terms', version: '1', token: 't' }),
  ];
  for (const response of pages) {
    assert.equal(response.headers.get('content-security-policy'), "default-src 'none'; style-src 'unsafe-inline'; font-src 'self'; form-action 'self' https://www.facebook.com; frame-ancestors 'none'");
    const body = await response.text();
    assert.ok(body.includes(`<style>${LOOK}</style>`));
    assert.ok(body.includes(HEADER));
    assert.ok(!/ style="/.test(body));
  }
});

test('the one step a page asks for is its primary button', async () => {
  assert.match(await keyPage({ label: 'Luma', help: 'h', token: 't' }).text(), /<button type="submit" class="primary">Connect<\/button>/);
  assert.match(await termsPage({ url: 'https://example.com/terms', version: '1', token: 't' }).text(), /<button type="submit" class="primary">Accept<\/button>/);
});

test('the account page is rendered on the server, hands its view to its own script as data, and runs no script inline', async () => {
  const view: AccountView = { email: 'ada@example.com', notice: { text: 'Saved </script><script>alert(1)</script>', tone: 'info' } };
  const response = portalPage(portal, view, 'home');
  assert.equal(response.headers.get('content-security-policy'), "default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; font-src 'self'; form-action 'self' https://www.facebook.com; frame-ancestors 'none'; base-uri 'none'");
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const body = await response.text();
  assert.match(body, /<meta name="referrer" content="same-origin">/);
  assert.ok(body.includes(`<div id="root">${renderPortal(view, 'home')}</div>`), 'the page is the server render');
  const data = body.match(/<script type="application\/json" id="portal-view">(.*?)<\/script>/s)?.[1] ?? '';
  assert.deepEqual(JSON.parse(data), { view, tab: 'home' }, 'the script gets the same view');
  assert.ok(!data.includes('<'), 'nothing in the data can end its script element');
  assert.deepEqual([...body.matchAll(/<script(?![^>]*application\/json)[^>]*>/g)].map((m) => m[0]), [`<script type="module" src="${portalScript(portal)}">`]);
});

test('the script\'s address changes with the script, so it can be cached for good', () => {
  assert.match(portalScript(portal), /^\/portal\.js\?v=[0-9a-z]+$/);
  assert.equal(portalScript(portal), portalScript({ ...portal }));
  assert.notEqual(portalScript(portal), portalScript({ ...portal, script: 'export const changed = 1;' }));
});

test('a notice can be dismissed, and one about a change that failed is announced as an error', () => {
  const info = renderPortal({ email: null, notice: { text: 'Brand named.', tone: 'info' } }, 'home');
  assert.match(info, /role="status"[^>]*>.*Brand named\..*aria-label="Dismiss"/s);
  const error = renderPortal({ email: null, notice: { text: 'That address is not on the waitlist.', tone: 'error' } }, 'home');
  assert.match(error, /role="alert"/);
});

test('a person signed in with Instagram who is not activated is shown their handle and how to be let in with it', () => {
  const page = renderPortal({ email: null, handle: 'cy.makes', join: 'https://cmokit.example/' }, 'home');
  assert.match(page, /<h1[^>]*>You&#x27;re not activated yet<\/h1>/);
  assert.match(page, /Signed in<!-- --> as <strong[^>]*>@cy\.makes<\/strong>/);
  assert.match(page, /comment your waitlist code on one of CMO Kit&#x27;s Reels from @<!-- -->cy\.makes/);
  assert.doesNotMatch(renderPortal({ email: 'ada@example.com', join: null }, 'home'), /Reels/);
});
