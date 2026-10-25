// A message template, a markdown file with a `subject` in its front matter, is sent as plain text and
// as simple HTML, with a footer naming why it was sent, how to stop it and the sender's address.

import { parseTemplate as parse } from '@cmokit/cli';

export { parse };

export interface Rendered {
  subject: string;
  text: string;
  html: string;
}

export interface Footer {
  /** The site the lead signed up on, such as example.com. */
  site: string;
  unsubscribeUrl: string;
  address: string;
}

export function render(template: string, footer: Footer): Rendered {
  const parsed = parse(template);
  if ('problem' in parsed) throw new Error(`message template ${parsed.problem}`);
  const why = `You are getting this because you signed up at ${footer.site}.`;
  const text = `${plain(parsed.body)}\n\n--\n${why} Unsubscribe: ${footer.unsubscribeUrl}\n${footer.address}\n`;
  const paragraphs = parsed.body.split(/\n\s*\n/).map((p) => `<p>${inline(p).replace(/\n/g, '<br>')}</p>`);
  const html = `<!doctype html><html><body style="font-family:sans-serif;line-height:1.5;max-width:600px">`
    + paragraphs.join('\n')
    + `<p style="color:#666;font-size:12px;margin-top:2em">${escape(why)} `
    + `<a href="${escape(footer.unsubscribeUrl)}">Unsubscribe</a>.<br>${escape(footer.address)}</p>`
    + `</body></html>`;
  return { subject: parsed.subject, text, html };
}

const LINK = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;

function plain(markdown: string): string {
  return markdown.replace(LINK, '$1 ($2)').replace(/\*\*([^*]+)\*\*/g, '$1').replace(/\*([^*]+)\*/g, '$1');
}

function inline(markdown: string): string {
  return escape(markdown)
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (_m, label: string, url: string) => `<a href="${url}">${label}</a>`)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>');
}

function escape(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
