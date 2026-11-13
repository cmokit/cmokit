// The content server's pages wear CMOkit's own look, shared with the sign-in pages (ADR-0046).

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { HEADER, LOOK } from '@cmokit/issuer/look';
import { accountPage, keyPage, termsPage } from '../src/pages.ts';

test('every page carries the shared look under the wordmark, loads fonts only from its own origin, and styles no element on its own', async () => {
  const pages = [
    keyPage({ label: 'Luma', help: 'Find the key in Luma.', token: 't' }),
    termsPage({ url: 'https://example.com/terms', version: '1', token: 't' }),
    accountPage({ email: 'ada@example.com' }),
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

test('a person signed in with Instagram who is not activated is shown their handle and how to be let in with it', async () => {
  const page = await accountPage({ email: null, handle: 'cy.makes', join: 'https://cmokit.example/' }).text();
  assert.match(page, /<h1>You're not activated yet<\/h1>/);
  assert.match(page, /Signed in as <strong>@cy\.makes<\/strong>/);
  assert.match(page, /comment your waitlist code on one of CMO Kit's Reels from @cy\.makes/);
  const byEmail = await accountPage({ email: 'ada@example.com', join: null }).text();
  assert.doesNotMatch(byEmail, /Reels/);
});
