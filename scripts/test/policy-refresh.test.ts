import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  compare, entryResults, entrySources, hashText, mainText, needsModel, pendingEntries, stamp, updated, type Source,
} from '../policy-refresh.ts';

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

const rules = [
  '---', 'schema_version: 1', 'as_of: 2026-11-06', '---', '', '## TikTok', '',
  '### TT-1', '- source_url: https://a.example/ai ; https://b.example/rules (2026)', '- verified_on: 2026-11-06', '- status: current', '',
  '### TT-2', '- source_url: https://a.example/ai', '- verified_on: 2026-11-06', '- status: current', '',
  '### TT-3', '- source_url: https://c.example/gone', '- verified_on: 2026-11-06', '- status: current', '',
  '### LI-3', '- source_url: a vendor blog (exact page not recorded)', '- verified_on: none', '- status: needs_verification', '',
].join('\n');

const monitored = (id: string, url: string): Source => ({
  id, platform: 'tiktok', url, source_type: 'primary', content_hash: 'h', last_checked: '2026-11-06', fetch_status: 'ok',
});

test('an entry lists every URL on its source_url line, and none when it names no page', () => {
  const sources = entrySources(rules);
  assert.deepEqual(sources.get('TT-1'), ['https://a.example/ai', 'https://b.example/rules']);
  assert.deepEqual(sources.get('LI-3'), []);
});

test('an entry is unchanged only when every source was read and unchanged', () => {
  const sources = [monitored('a', 'https://a.example/ai'), monitored('b', 'https://b.example/rules'), monitored('c', 'https://c.example/gone')];
  const outcomes = [
    { id: 'a', url: 'https://a.example/ai', result: 'unchanged' as const, hash: 'h' },
    { id: 'b', url: 'https://b.example/rules', result: 'changed' as const, hash: 'x' },
    { id: 'c', url: 'https://c.example/gone', result: 'unfetchable' as const, hash: null },
  ];
  const results = entryResults(rules, sources, outcomes);
  assert.equal(results.get('TT-1'), 'changed');
  assert.equal(results.get('TT-2'), 'unchanged');
  assert.equal(results.get('TT-3'), 'unread');
  assert.equal(results.get('LI-3'), 'unread');
  assert.equal(entryResults(rules, [], []).get('TT-2'), 'unread');
});

test('a run moves as_of, and verifies only the current entries whose sources were all unchanged', () => {
  const results = new Map([['TT-1', 'changed'], ['TT-2', 'unchanged'], ['TT-3', 'unread'], ['LI-3', 'unchanged']] as const);
  const after = stamp(rules, new Map(results), '2026-12-01');
  const verified = (id: string) => after.split(`### ${id}\n`)[1].match(/^- verified_on: (.*)$/m)?.[1];
  assert.match(after, /^as_of: 2026-12-01$/m);
  assert.equal(verified('TT-1'), '2026-11-06');
  assert.equal(verified('TT-2'), '2026-12-01');
  assert.equal(verified('TT-3'), '2026-11-06');
  assert.equal(verified('LI-3'), 'none');
  assert.equal(stamp(rules, new Map(), '2026-11-06'), rules);
});
