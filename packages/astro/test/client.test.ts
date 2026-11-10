import assert from 'node:assert/strict';
import { test } from 'node:test';
import { withoutQueries } from '../src/client.ts';

test('no URL the browser sends to analytics keeps its query string or fragment', () => {
  const event = {
    uuid: 'u', event: '$pageview',
    properties: {
      $current_url: 'https://site.example/join?email=ada%40example.com&ref=abc#top',
      $referrer: 'https://news.example/post?id=7',
      $initial_referrer: '$direct',
      $pathname: '/join',
      utm_source: 'instagram',
      $set_once: { $initial_current_url: 'https://site.example/?token=secret' },
    },
    $set: { $current_url: 'https://site.example/a?b=c' },
  };
  const sent = withoutQueries(event as never)!;
  assert.equal(sent.properties.$current_url, 'https://site.example/join');
  assert.equal(sent.properties.$referrer, 'https://news.example/post');
  assert.equal(sent.properties.$initial_referrer, '$direct', 'a value that is not a URL is left as it is');
  assert.equal(sent.properties.utm_source, 'instagram', 'recorded parameters travel as properties of their own');
  assert.equal((sent.properties.$set_once as Record<string, string>).$initial_current_url, 'https://site.example/');
  assert.equal(sent.$set!.$current_url, 'https://site.example/a');
  assert.equal(withoutQueries(null), null);
});
