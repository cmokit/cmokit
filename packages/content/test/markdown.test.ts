// Brand context sections are Markdown a person approved; the account page shows them formatted and
// renders no HTML from them.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MarkdownText } from '../apps/ui/markdown.tsx';

const html = (text: string) => renderToStaticMarkup(createElement(MarkdownText, { text }));

test('a section is shown as formatted text: paragraphs, bold, and bulleted and numbered lists', () => {
  const out = html('**What:** a loop.\n\n- Human first\n- Authenticity\n\n1. Creators\n2. Founders');
  assert.match(out, /<p><strong[^>]*>What:<\/strong> a loop\.<\/p>/);
  assert.match(out, /<ul[^>]*>\s*<li>Human first<\/li>\s*<li>Authenticity<\/li>\s*<\/ul>/);
  assert.match(out, /<ol[^>]*>\s*<li>Creators<\/li>\s*<li>Founders<\/li>\s*<\/ol>/);
  assert.doesNotMatch(out, /\*\*|^- /m, 'no Markdown syntax is left showing');
});

test('a heading in a section sits below the section title', () => {
  assert.match(html('# Big\n\n### Small'), /<h4[^>]*>Big<\/h4>\s*<h4[^>]*>Small<\/h4>/);
});

test('no HTML, script, image or unsafe link from the text reaches the page', () => {
  const out = html('<script>alert(1)</script>\n\n<b onclick="x()">hi</b> ![x](https://example.com/x.png) [bad](javascript:alert(1)) [ok](https://example.com/)');
  assert.doesNotMatch(out, /<script|onclick|<b>|<img|javascript:/i);
  assert.match(out, /<a href="https:\/\/example\.com\/" target="_blank" rel="noopener noreferrer nofollow"[^>]*>ok<\/a>/);
});
