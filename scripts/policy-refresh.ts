// Checks the sources behind the content skill's platform AI content rules for changes (ADR-0037).
// Fetches each URL in policy-sources.json, hashes the page's main text, and compares the hash with
// the stored one. Run with `node scripts/policy-refresh.ts`; `--dry-run` changes nothing, and
// `--report <file>` writes what the model step must re-read. In GitHub Actions it also sets the
// output `needs_model`, true only when a source's main text changed, has no stored hash yet, or could
// not be fetched where it could last time. Entries still marked needs_verification or unfetchable are
// listed in the report for a person: re-reading an unchanged page would give the model the same answer.

import { createHash } from 'node:crypto';
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const references = join(import.meta.dirname, '../plugins/cmokit-content/skills/content/references');
const sourcesPath = join(references, 'policy-sources.json');
const policiesPath = join(references, 'ai-content-policies.md');

/** Below this many characters of main text, a page is taken to be metadata or a bot wall. */
const MIN_TEXT = 500;
const STRIPPED = ['script', 'style', 'noscript', 'svg', 'template', 'nav', 'header', 'footer', 'aside', 'form'];
const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

export interface Source {
  id: string;
  platform: string;
  url: string;
  source_type: string;
  content_hash: string | null;
  last_checked: string | null;
  fetch_status: 'ok' | 'unfetchable' | 'not_checked';
}

export interface Outcome {
  id: string;
  url: string;
  result: 'unchanged' | 'changed' | 'unfetchable';
  hash: string | null;
}

/** The page's main text: no scripts, navigation, headers or footers, and inside <main> or <article> when there is one. */
export function mainText(html: string): string {
  let page = html.replace(/<!--[\s\S]*?-->/g, ' ');
  for (const tag of STRIPPED) page = page.replace(new RegExp(`<${tag}\\b[\\s\\S]*?</${tag}>`, 'gi'), ' ');
  const main = page.match(/<main\b[\s\S]*<\/main>/i) ?? page.match(/<article\b[\s\S]*<\/article>/i);
  return (main ? main[0] : page)
    .replace(/<[^>]+>/g, ' ')
    .replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (entity, name: string) => {
      if (name[0] !== '#') return ENTITIES[name.toLowerCase()] ?? entity;
      const code = name[1] === 'x' || name[1] === 'X' ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
      return Number.isFinite(code) && code <= 0x10ffff ? String.fromCodePoint(code) : entity;
    })
    .replace(/\s+/g, ' ')
    .trim();
}

export const hashText = (text: string) => createHash('sha256').update(text).digest('hex');

/** Compares a fetched page's main text with the source's stored hash. A page too thin to read is unfetchable. */
export function compare(source: Source, text: string | null): Outcome {
  const base = { id: source.id, url: source.url };
  if (text === null || text.length < MIN_TEXT) return { ...base, result: 'unfetchable', hash: null };
  const hash = hashText(text);
  return { ...base, result: hash === source.content_hash ? 'unchanged' : 'changed', hash };
}

/** The ids of entries in the policies file whose status says they still need a person or the model. */
export function pendingEntries(policies: string): string[] {
  return policies
    .split(/^### /m)
    .slice(1)
    .filter((entry) => /^- status: (needs_verification|unfetchable)\s*$/m.test(entry))
    .map((entry) => entry.split('\n', 1)[0].trim());
}

/** Whether a source moved since the last run: its text changed, or it became unfetchable. */
export const needsModel = (sources: Source[], outcomes: Outcome[]) =>
  outcomes.some((o, i) => o.result === 'changed' || (o.result === 'unfetchable' && sources[i].fetch_status !== 'unfetchable'));

/** The record of each source after this run. An unfetchable page keeps its last good hash. */
export function updated(source: Source, outcome: Outcome, today: string): Source {
  return {
    ...source,
    content_hash: outcome.hash ?? source.content_hash,
    last_checked: today,
    fetch_status: outcome.result === 'unfetchable' ? 'unfetchable' : 'ok',
  };
}

export function report(outcomes: Outcome[], pending: string[]): string {
  const list = (result: Outcome['result']) =>
    outcomes.filter((o) => o.result === result).map((o) => `* ${o.id}: ${o.url}`);
  const lines = [
    '# Policy refresh: what to re-read',
    '',
    '## Sources whose main text changed, or that have no stored hash yet',
    ...(list('changed').length ? list('changed') : ['* none']),
    '',
    '## Sources that could not be fetched (do not guess their content)',
    ...(list('unfetchable').length ? list('unfetchable') : ['* none']),
    '',
    '## Entries marked needs_verification or unfetchable, for a person to verify',
    ...(pending.length ? pending.map((id) => `* ${id}`) : ['* none']),
  ];
  return `${lines.join('\n')}\n`;
}

async function fetchText(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, {
      headers: { 'user-agent': 'cmokit-policy-refresh (+https://github.com/cmokit/cmokit)' },
      signal: AbortSignal.timeout(30_000),
    });
    const type = response.headers.get('content-type') ?? '';
    if (!response.ok || !/html|text/.test(type)) return null;
    return mainText(await response.text());
  } catch {
    return null;
  }
}

async function main(args: string[]): Promise<void> {
  const dryRun = args.includes('--dry-run');
  const reportAt = args.includes('--report') ? args[args.indexOf('--report') + 1] : undefined;
  const sources = JSON.parse(readFileSync(sourcesPath, 'utf8')) as Source[];
  const pending = pendingEntries(readFileSync(policiesPath, 'utf8'));
  const outcomes: Outcome[] = [];
  for (const source of sources) outcomes.push(compare(source, await fetchText(source.url)));

  const text = report(outcomes, pending);
  const model = needsModel(sources, outcomes);
  console.log(text);
  console.log(model ? 'The model step is needed.' : 'Nothing changed: no model step.');
  if (dryRun) return;

  const today = new Date().toISOString().slice(0, 10);
  const next = sources.map((source, i) => updated(source, outcomes[i], today));
  writeFileSync(sourcesPath, `${JSON.stringify(next, null, 2)}\n`);
  if (reportAt) writeFileSync(reportAt, text);
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `needs_model=${model}\n`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main(process.argv.slice(2));
