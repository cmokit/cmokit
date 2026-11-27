// The beta terms' version is read from the published page, used for a few minutes, and kept when the
// page cannot be read again, so publishing new terms is all it takes to ask everyone again (ADR-0047).

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { publishedTerms, TERMS_REFRESH, termsVersion } from '../src/index.ts';

const T0 = Date.parse('2026-11-27T12:00:00Z');

/** Answers every fetch with the next of the given pages, or a failure when one is a number. */
function pages(...answers: (string | number)[]) {
  const real = globalThis.fetch;
  let reads = 0;
  globalThis.fetch = async () => {
    const answer = answers[Math.min(reads++, answers.length - 1)]!;
    return typeof answer === 'number' ? new Response(null, { status: answer }) : new Response(answer);
  };
  return { reads: () => reads, restore: () => { globalThis.fetch = real; } };
}

test('the version is the one the page names after "Version"', () => {
  assert.equal(termsVersion('<header><h1>CMOKit beta terms</h1><p>Version 2026-11-25</p></header>'), '2026-11-25');
  assert.equal(termsVersion('<p>Version <strong>3.1</strong></p>'), '3.1');
  assert.equal(termsVersion('<p>No version here</p>'), undefined);
});

test('without an address no terms are asked for and nothing is read', async () => {
  const net = pages('<p>Version 1</p>');
  try {
    assert.equal(await publishedTerms(undefined, T0), undefined);
    assert.equal(await publishedTerms('  ', T0), undefined);
    assert.equal(net.reads(), 0);
  } finally {
    net.restore();
  }
});

test('a version read is used for a few minutes, then the page is read again', async () => {
  const url = 'https://cmokit.example/refresh/';
  const net = pages('<p>Version 2026-11-11</p>', '<p>Version 2026-11-25</p>');
  try {
    assert.deepEqual(await publishedTerms(url, T0), { url, version: '2026-11-11' });
    assert.deepEqual(await publishedTerms(url, T0 + TERMS_REFRESH - 1), { url, version: '2026-11-11' });
    assert.equal(net.reads(), 1);
    assert.deepEqual(await publishedTerms(url, T0 + TERMS_REFRESH), { url, version: '2026-11-25' });
    assert.equal(net.reads(), 2);
  } finally {
    net.restore();
  }
});

test('when the page cannot be read again, the last version read is kept', async () => {
  const url = 'https://cmokit.example/kept/';
  const net = pages('<p>Version 2026-11-25</p>', 503, '<p>No version</p>');
  try {
    await publishedTerms(url, T0);
    assert.deepEqual(await publishedTerms(url, T0 + TERMS_REFRESH), { url, version: '2026-11-25' });
    assert.deepEqual(await publishedTerms(url, T0 + 2 * TERMS_REFRESH), { url, version: '2026-11-25' });
  } finally {
    net.restore();
  }
});

test('when the page has never been read, signing in fails rather than skip the terms', async () => {
  const net = pages(503, '<p>Nothing to accept</p>');
  try {
    await assert.rejects(publishedTerms('https://cmokit.example/down/', T0), /answered 503/);
    await assert.rejects(publishedTerms('https://cmokit.example/blank/', T0), /name no version/);
  } finally {
    net.restore();
  }
});
