import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parse, render } from '../src/render.ts';
import { templateProblems } from '../src/worker.ts';
import { TEMPLATES, resolved } from './fixtures.ts';

const footer = { site: 'site.example', unsubscribeUrl: 'https://site.example/u?a=1&b=2', address: '1 Main St' };

test('a template is sent as text and as HTML, escaped, with the footer', () => {
  const out = render('---\nsubject: Hi <there>\n---\nSee [the guide](https://x.example/?a=1&b=2) and **this** <b>.\nNext line.\n\nNew paragraph.', footer);
  assert.equal(out.subject, 'Hi <there>');
  assert.match(out.text, /^See the guide \(https:\/\/x\.example\/\?a=1&b=2\) and this <b>\.\nNext line\.\n\nNew paragraph\./);
  assert.match(out.text, /Unsubscribe: https:\/\/site\.example\/u\?a=1&b=2\n1 Main St\n$/);
  assert.match(out.html, /<p>See <a href="https:\/\/x\.example\/\?a=1&amp;b=2">the guide<\/a> and <strong>this<\/strong> &lt;b&gt;\.<br>Next line\.<\/p>/);
  assert.match(out.html, /<p>New paragraph\.<\/p>/);
  assert.match(out.html, /<a href="https:\/\/site\.example\/u\?a=1&amp;b=2">Unsubscribe<\/a>/);
});

test('a template needs front matter with a subject, and every configured message needs a template', () => {
  assert.deepEqual(parse('no front matter'), { problem: 'needs front matter between --- lines, with a subject' });
  assert.deepEqual(parse('---\ntitle: x\n---\nbody'), { problem: 'needs a subject in its front matter' });
  assert.deepEqual(templateProblems(resolved, TEMPLATES), []);
  assert.deepEqual(templateProblems(resolved, { welcome: TEMPLATES.welcome, 'follow-up': 'oops' }), [
    'messages/follow-up.md needs front matter between --- lines, with a subject',
  ]);
  assert.deepEqual(templateProblems(resolved, { 'follow-up': TEMPLATES['follow-up'] }), [
    'sequence "welcome": no template messages/welcome.md',
    'sequence "webinar": no template messages/welcome.md',
  ]);
});
