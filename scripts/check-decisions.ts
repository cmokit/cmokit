// Checks the mechanical rules of ADR-0001 over the vision, the requirements and the decision records.
// Run with `npm run check:decisions`. Exits non-zero, listing every violation, if any rule is broken.

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const decisionsDir = join(root, 'docs/decisions');
const requirementsPath = join(root, 'docs/product/requirements.md');
const visionPath = join(root, 'docs/product/vision.md');

const REQUIREMENT_ID = /\b[A-Z]{2,5}-\d{2}\b/g;
const RECORD_REF = /\bADR-\d{4}\b/g;
const RECORD_FILE = /^(\d{4})-[a-z0-9-]+\.md$/;
const KINDS = ['requirement-driven', 'substrate'];
const STATUSES = ['draft', 'proposed', 'accepted', 'rejected', 'deprecated'];
const MANDATORY_SECTIONS = ['Considered Options', 'Pros and Cons of the Options', 'Revisit when'];

const errors: string[] = [];
const fail = (where: string, message: string) => errors.push(`${where}: ${message}`);

const read = (path: string) => readFileSync(path, 'utf8');
const unique = (values: Iterable<string>) => [...new Set(values)];

// Requirements: every id defined once; no decision record cited.
const requirements = read(requirementsPath);
const defined = [...requirements.matchAll(/^\| \*\*([A-Z]{2,5}-\d{2})\*\* \|/gm)].map((m) => m[1]);
const liveIds = new Set(defined);
for (const id of unique(defined.filter((id, i) => defined.indexOf(id) !== i))) {
  fail('requirements.md', `${id} is defined more than once`);
}
for (const ref of unique(requirements.match(RECORD_REF) ?? [])) {
  fail('requirements.md', `cites ${ref}; requirements cite no decision record`);
}

// Vision: cites nothing.
const vision = read(visionPath);
for (const ref of unique([...(vision.match(RECORD_REF) ?? []), ...(vision.match(REQUIREMENT_ID) ?? [])])) {
  fail('vision.md', `cites ${ref}; the vision cites nothing`);
}

// Records.
interface Record {
  file: string;
  number: string;
  title: string;
  status: string;
}

const files = readdirSync(decisionsDir).filter((f) => RECORD_FILE.test(f)).sort();
const numbers = new Set(files.map((f) => f.slice(0, 4)));
const records: Record[] = [];

files.forEach((file, index) => {
  const number = file.slice(0, 4);
  const text = read(join(decisionsDir, file));

  const expected = String(index + 1).padStart(4, '0');
  if (number !== expected) fail(file, `numbered ${number}; records are numbered sequentially, expected ${expected}`);

  const front = text.match(/^---\n([\s\S]*?)\n---\n/);
  if (!front) {
    fail(file, 'has no front matter');
    return;
  }
  const field = (name: string) => front[1].match(new RegExp(`^${name}:\\s*"?([^"\\n]*)"?\\s*$`, 'm'))?.[1];

  const status = field('status') ?? '';
  const superseded = status.match(/^superseded by ADR-(\d{4})$/);
  if (superseded) {
    if (!numbers.has(superseded[1])) fail(file, `is superseded by ADR-${superseded[1]}, which does not exist`);
  } else if (!STATUSES.includes(status)) {
    fail(file, `has status "${status}"; expected one of ${STATUSES.join(', ')}, or "superseded by ADR-NNNN"`);
  }

  const kind = field('kind') ?? '';
  if (!KINDS.includes(kind)) fail(file, `has kind "${kind}"; expected ${KINDS.join(' or ')}`);

  const heading = text.match(/^# ADR-(\d{4}): (.+)$/m);
  if (!heading) {
    fail(file, 'has no "# ADR-NNNN: title" heading');
    return;
  }
  if (heading[1] !== number) fail(file, `is headed ADR-${heading[1]} but numbered ${number}`);

  for (const section of MANDATORY_SECTIONS) {
    if (!new RegExp(`^## ${section}\\s*$`, 'm').test(text)) fail(file, `has no "## ${section}" section`);
  }

  const body = text.slice(front[0].length);
  const cited = unique(body.match(REQUIREMENT_ID) ?? []);
  if (kind === 'requirement-driven') {
    if (cited.length === 0) fail(file, 'is requirement-driven but cites no requirement id');
    for (const id of cited) if (!liveIds.has(id)) fail(file, `cites ${id}, which is not a live requirement`);
  }
  if (kind === 'substrate') {
    for (const id of cited) fail(file, `is substrate but cites ${id}; a substrate record cites no requirement`);
  }

  for (const ref of unique(body.match(RECORD_REF) ?? [])) {
    if (!numbers.has(ref.slice(4))) fail(file, `refers to ${ref}, which does not exist`);
  }

  records.push({ file, number, title: heading[2].trim(), status });
});

// Index: one row per record, linking its file, with its title and status.
const index = read(join(decisionsDir, 'README.md'));
const rows = [...index.matchAll(/^\| \[(\d{4})\]\(([^)]+)\) \| (.+?) \| (.+?) \|$/gm)].map((m) => ({
  number: m[1],
  link: m[2],
  title: m[3].trim(),
  status: m[4].trim(),
}));
const capitalized = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

for (const record of records) {
  const row = rows.find((r) => r.number === record.number);
  if (!row) {
    fail('README.md', `has no row for ${record.file}`);
    continue;
  }
  if (row.link !== record.file) fail('README.md', `row ${row.number} links ${row.link}, not ${record.file}`);
  if (row.title !== record.title) fail('README.md', `row ${row.number} reads "${row.title}"; the record is titled "${record.title}"`);
  if (row.status !== capitalized(record.status)) {
    fail('README.md', `row ${row.number} has status "${row.status}"; the record has "${record.status}"`);
  }
}
for (const row of rows) {
  if (!records.some((r) => r.number === row.number)) fail('README.md', `row ${row.number} has no record file`);
}

if (errors.length > 0) {
  console.error(errors.join('\n'));
  console.error(`\n${errors.length} problem${errors.length === 1 ? '' : 's'} in the decision records.`);
  process.exit(1);
}
console.log(`${records.length} decision records and ${liveIds.size} requirements check out.`);
