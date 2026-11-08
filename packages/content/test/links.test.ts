import assert from 'node:assert/strict';
import { test } from 'node:test';
import { trackedLink } from '../src/index.ts';

const link = { platform: 'instagram' as const, campaign: 'table', piece: 'p1' };

test('a tracked link adds the four UTM parameters and changes nothing else', () => {
  assert.equal(trackedLink('https://luma.com/table-nov', link),
    'https://luma.com/table-nov?utm_source=instagram&utm_medium=social&utm_campaign=table&utm_content=p1');
  assert.equal(trackedLink('https://site.example/a%20b/?ref=x%20y&q=1#tickets', link),
    'https://site.example/a%20b/?ref=x%20y&q=1&utm_source=instagram&utm_medium=social&utm_campaign=table&utm_content=p1#tickets');
});

test('the same piece always gets the same link, and an old UTM parameter is replaced', () => {
  const once = trackedLink('https://luma.com/e?utm_source=newsletter&x=1', link);
  assert.equal(once, 'https://luma.com/e?x=1&utm_source=instagram&utm_medium=social&utm_campaign=table&utm_content=p1');
  assert.equal(trackedLink('https://luma.com/e?utm_source=newsletter&x=1', link), once);
  assert.equal(trackedLink(once, link), once);
});
