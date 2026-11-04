import assert from 'node:assert/strict';
import { test } from 'node:test';
import { compare, hashText, mainText, needsModel, pendingEntries, updated, type Source } from '../policy-refresh.ts';

const body = 'Creators must label realistic AI-generated content. '.repeat(20);
const page = (nav: string, main: string) =>
  `<html><head><script>var t = ${Math.random()};</script></head><body><nav>${nav}</nav><main><h1>AI content</h1><p>${main}</p></main><footer>Ad ${nav}</footer></body></html>`;

const source = (hash: string | null): Source => ({
  id: 'tiktok', platform: 'tiktok', url: 'https://example.com/ai', source_type: 'primary',
  content_hash: hash, last_checked: null, fetch_status: 'not_checked',
});

test('navigation, scripts and footers do not change the main text', () => {
  assert.equal(mainText(page('Home | Shop', body)), mainText(page('Home | Sale today', body)));
});

test('the main text is the <main> element, with entities decoded and space collapsed', () => {
  assert.equal(mainText('<header>x</header><main><p>Don&#39;t  &amp;\n remove</p></main>'), "Don't & remove");
});

test('a page whose main text is unchanged is unchanged', () => {
  const text = mainText(page('Home', body));
  assert.equal(compare(source(hashText(text)), text).result, 'unchanged');
});

test('a page whose main text changed, or with no stored hash, is changed', () => {
  const text = mainText(page('Home', body));
  assert.equal(compare(source(hashText(text)), `${text} Unlabeled content may be removed.`).result, 'changed');
  assert.equal(compare(source(null), text).result, 'changed');
});

test('a page that could not be fetched, or holds only metadata, is unfetchable and gets no hash', () => {
  assert.deepEqual(compare(source('abc'), null), { id: 'tiktok', url: 'https://example.com/ai', result: 'unfetchable', hash: null });
  assert.equal(compare(source('abc'), mainText('<main><p>Log in to continue</p></main>')).result, 'unfetchable');
});

test('an unfetchable page keeps its last good hash', () => {
  const after = updated(source('abc'), compare(source('abc'), null), '2026-11-01');
  assert.equal(after.content_hash, 'abc');
  assert.equal(after.fetch_status, 'unfetchable');
  assert.equal(after.last_checked, '2026-11-01');
});

test('entries marked needs_verification or unfetchable are pending', () => {
  const policies = [
    '## TikTok', '', '### TT-1', '- status: current', '', '### TT-2', '- status: needs_verification', '',
    '### LI-4', '- status: unfetchable', '',
  ].join('\n');
  assert.deepEqual(pendingEntries(policies), ['TT-2', 'LI-4']);
});

test('the model is needed only when a source changed or became unfetchable, never for pending entries alone', () => {
  const source: Source = { id: 'a', platform: 'TikTok', url: 'u', source_type: 'primary', content_hash: 'h', last_checked: '2026-10-01', fetch_status: 'ok' };
  const unchanged = { id: 'a', url: 'u', result: 'unchanged' as const, hash: 'h' };
  const unfetchable = { ...unchanged, result: 'unfetchable' as const, hash: null };
  assert.equal(needsModel([source], [unchanged]), false);
  assert.equal(needsModel([source], [{ ...unchanged, result: 'changed' }]), true);
  assert.equal(needsModel([source], [unfetchable]), true);
  assert.equal(needsModel([{ ...source, fetch_status: 'unfetchable' }], [unfetchable]), false);
});
