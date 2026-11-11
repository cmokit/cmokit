// The issuer's records on Node's SQLite: email codes expire, lock after five attempts and are limited
// per address and per network, and an identity belongs to the first person who claims it.

import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { CODE_ATTEMPTS, CODE_LIFETIME, Identity, Person, SENDS_PER_ADDRESS, type Sql } from '../src/index.ts';

function sqlite(): Sql {
  const db = new DatabaseSync(':memory:');
  return { all: (query, ...params) => db.prepare(query).all(...params) as ReturnType<Sql['all']> };
}

const T0 = Date.parse('2026-11-09T12:00:00Z');

test('a code is six digits, works once, and expires after ten minutes', async () => {
  const identity = new Identity(sqlite());
  const code = (await identity.issueCode(T0))!;
  assert.match(code, /^\d{6}$/);
  assert.equal(await identity.checkCode(code, T0 + 1000), 'ok');
  assert.equal(await identity.checkCode(code, T0 + 2000), 'gone');

  const late = (await identity.issueCode(T0))!;
  assert.equal(await identity.checkCode(late, T0 + CODE_LIFETIME), 'gone');
});

test('a code locks after five wrong attempts, even if the right one comes next', async () => {
  const identity = new Identity(sqlite());
  const code = (await identity.issueCode(T0))!;
  const wrong = code === '000000' ? '111111' : '000000';
  for (let i = 1; i < CODE_ATTEMPTS; i++) assert.equal(await identity.checkCode(wrong, T0), 'wrong');
  assert.equal(await identity.checkCode(wrong, T0), 'gone');
  assert.equal(await identity.checkCode(code, T0), 'gone');
});

test('a new code replaces the pending one', async () => {
  const identity = new Identity(sqlite());
  const first = (await identity.issueCode(T0))!;
  let second = (await identity.issueCode(T0 + 1))!;
  while (second === first) second = (await identity.issueCode(T0 + 1))!;
  assert.equal(await identity.checkCode(first, T0 + 2), 'wrong');
  assert.equal(await identity.checkCode(second, T0 + 3), 'ok');
});

test('codes are limited per address per hour, and per network', async () => {
  const identity = new Identity(sqlite());
  for (let i = 0; i < SENDS_PER_ADDRESS; i++) assert.ok(await identity.issueCode(T0 + i));
  assert.equal(await identity.issueCode(T0 + 10), undefined);
  assert.ok(await identity.issueCode(T0 + 60 * 60_000 + 1));

  const network = new Identity(sqlite());
  assert.equal(await network.allow(2, T0), true);
  assert.equal(await network.allow(2, T0), true);
  assert.equal(await network.allow(2, T0), false);
});

test('only the hash of a code is kept', async () => {
  const sql = sqlite();
  const identity = new Identity(sql);
  const code = (await identity.issueCode(T0))!;
  const [row] = sql.all('SELECT * FROM code');
  assert.ok(!Object.values(row).some((value) => String(value).includes(code)));
});

test('an identity belongs to the first person who claims it', async () => {
  const identity = new Identity(sqlite());
  assert.equal(await identity.person(), null);
  assert.equal(await identity.claim('ada'), 'ada');
  assert.equal(await identity.claim('grace'), 'ada');
});

test('a person keeps their identities, the email they proved and their customers', async () => {
  const person = new Person(sqlite());
  await person.addIdentity('email:ada@example.com', 'ada@example.com', T0);
  await person.addIdentity('google:123', null, T0 + 1);
  await person.addCustomer('acme', T0);
  await person.addCustomer('acme', T0 + 1);
  assert.deepEqual(await person.identities(), ['email:ada@example.com', 'google:123']);
  assert.equal(await person.email(), 'ada@example.com');
  assert.deepEqual(await person.customers(), ['acme']);
});

test('a person names their brands, and a record made before names keeps its brands', async () => {
  const db = sqlite();
  db.all('CREATE TABLE customers (slug TEXT PRIMARY KEY, added_at INTEGER NOT NULL)');
  db.all('INSERT INTO customers (slug, added_at) VALUES (?, ?)', 'c0ffee', T0);
  const person = new Person(db);
  await person.addCustomer('cfo-kit-0a1b2c', T0 + 1, 'CFO Kit');
  assert.deepEqual(await person.brands(), [{ slug: 'c0ffee', name: null }, { slug: 'cfo-kit-0a1b2c', name: 'CFO Kit' }]);
  assert.equal(await person.nameCustomer('c0ffee', 'CMO Kit'), true);
  assert.equal(await person.nameCustomer('initech', 'Initech'), false, 'only a brand of theirs');
  assert.deepEqual(await person.brands(), [{ slug: 'c0ffee', name: 'CMO Kit' }, { slug: 'cfo-kit-0a1b2c', name: 'CFO Kit' }]);
  assert.deepEqual(await new Person(db).customers(), ['c0ffee', 'cfo-kit-0a1b2c'], 'opening the record again changes nothing');
});
