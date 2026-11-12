// CMOkit's own look (ADR-0046): one stylesheet on every page, and fonts served from the page's own origin.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { HEADER, LOOK, fontResponse, type Fonts } from '../src/look.ts';
import { codePage, signInPage } from '../src/pages.ts';

const fonts: Fonts = { display: new Uint8Array([1, 2]).buffer, body: new Uint8Array([3]).buffer };

test('each font is served as woff2, cached, and readable from another origin', async () => {
  const response = fontResponse(new Request('https://auth.example/fonts/display.woff2'), fonts)!;
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'font/woff2');
  assert.match(response.headers.get('cache-control')!, /^public, max-age=\d+$/);
  assert.equal(response.headers.get('access-control-allow-origin'), '*');
  assert.deepEqual([...new Uint8Array(await response.arrayBuffer())], [1, 2]);
  assert.deepEqual([...new Uint8Array(await fontResponse(new Request('https://auth.example/fonts/body.woff2'), fonts)!.arrayBuffer())], [3]);
  const head = fontResponse(new Request('https://auth.example/fonts/body.woff2', { method: 'HEAD' }), fonts)!;
  assert.equal(head.status, 200);
  assert.equal(await head.text(), '');
});

test('fonts answer nothing but their two paths, and a deployment without them falls back to the system font', () => {
  assert.equal(fontResponse(new Request('https://auth.example/authorize'), fonts), undefined);
  assert.equal(fontResponse(new Request('https://auth.example/fonts/other.woff2'), fonts), undefined);
  assert.equal(fontResponse(new Request('https://auth.example/fonts/body.woff2'), undefined)!.status, 404);
  assert.equal(fontResponse(new Request('https://auth.example/fonts/body.woff2', { method: 'POST' }), fonts)!.status, 405);
  assert.match(LOOK, /font-family:'Instrument Sans'[^}]*url\(\/fonts\/body\.woff2\)/);
  assert.match(LOOK, /--body:'Instrument Sans',system-ui/);
});

test('the sign-in pages wear the look under the wordmark, and load fonts only from their own origin', async () => {
  const client = { clientName: 'Claude', clientDomain: 'claude.ai', redirectHost: 'claude.ai', redirectIsLoopback: false };
  for (const response of [
    signInPage({ client, handle: 'h', ways: [{ name: 'github', label: 'GitHub' }], email: false, headers: new Headers() }),
    codePage({ address: 'ada@example.com', state: 's', headers: new Headers() }),
  ]) {
    assert.equal(response.headers.get('content-security-policy'), "font-src 'self'; frame-ancestors 'none'");
    const body = await response.text();
    assert.ok(body.includes(`<style>${LOOK}</style>`));
    assert.ok(body.includes(HEADER));
    assert.ok(!/ style="/.test(body), 'no element is styled on its own');
  }
});
