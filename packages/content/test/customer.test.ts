import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CALENDAR_KEY, guest, newCustomer, readyCustomer } from './fixtures.ts';

const BASE = 'https://content.example/customers/acme';

test('a missing calendar gets a one-time link, and the key given on its page is kept sealed', async () => {
  const { customer, sql } = newCustomer();
  const status = await customer.status('ada', BASE);
  assert.equal(status.access, 'active');
  assert.equal(status.missing.length, 1);
  const token = new URL(status.missing[0].link).searchParams.get('t')!;
  assert.ok(status.missing[0].link.startsWith(`${BASE}/connect?t=`));

  assert.deepEqual(await customer.linkFor(token), { vendor: 'stand-in', label: 'Stand-in Events', help: 'Make a key in the stand-in.' });
  assert.deepEqual(await customer.connect(token, 'wrong'), { ok: false, problem: 'Stand-in Events did not accept that key. Check it and try again.' });
  assert.deepEqual(await customer.connect(token, CALENDAR_KEY), { ok: true, calendar: 'Table calendar' });
  assert.equal(await customer.linkFor(token), undefined, 'a link works once');
  assert.equal((await customer.connect(token, CALENDAR_KEY)).ok, false);

  const stored = JSON.stringify(sql.all('SELECT * FROM connections'));
  assert.doesNotMatch(stored, new RegExp(CALENDAR_KEY), 'the key is kept only sealed');
  assert.doesNotMatch(JSON.stringify(sql.all('SELECT * FROM links')), new RegExp(token), 'a link is kept only hashed');
  const after = await customer.status('ada', BASE);
  assert.deepEqual(after.missing, []);
  assert.equal(after.connections[0].calendar, 'Table calendar');

});

test('a one-time link expires within minutes', async () => {
  const { customer, later } = newCustomer();
  const token = new URL((await customer.status('ada', BASE)).missing[0].link).searchParams.get('t')!;
  later(16 * 60_000);
  assert.equal(await customer.linkFor(token), undefined);
  assert.equal((await customer.connect(token, CALENDAR_KEY)).ok, false);
});

test('the brand context changes only with an approval, from the current version, and restores exactly', async () => {
  const { customer } = newCustomer();
  assert.deepEqual(await customer.brandRead(), { version: 0, context: { sections: {}, offers: [] }, at: null });
  await assert.rejects(customer.brandChange('ada', { approved: false, base_version: 0, reason: 'x', sections: { voice: 'Warm' } }), /approves/);
  await assert.rejects(customer.brandChange('ada', { approved: true, base_version: 0, reason: ' ', sections: { voice: 'Warm' } }), /reason/);
  await assert.rejects(customer.brandChange('ada', { approved: true, base_version: 0, reason: 'x', sections: { tone: 'Warm' } as never }), /no section tone/);

  assert.deepEqual(await customer.brandChange('ada', { approved: true, base_version: 0, reason: 'First', sections: { voice: 'Warm', values: 'No cure claims' } }), { version: 1 });
  await assert.rejects(customer.brandChange('ada', { approved: true, base_version: 0, reason: 'Stale', sections: { voice: 'Cold' } }), /now version 1/);
  await customer.brandChange('ada', {
    approved: true, base_version: 1, reason: 'Five edits shortened the hook', signals: ['p1', 'p2'],
    sections: { voice: 'Warm and short', values: '' },
    offers: [{ id: 'table', name: 'Table', pattern: 'series' }],
  });
  const second = await customer.brandRead();
  assert.deepEqual(second.context, { sections: { voice: 'Warm and short' }, offers: [{ id: 'table', name: 'Table', pattern: 'series' }] });

  await customer.brandChange('bob', { approved: true, base_version: 2, reason: 'Undo', restore: 1 });
  const third = await customer.brandRead();
  assert.equal(third.version, 3);
  assert.deepEqual(third.context, { sections: { voice: 'Warm', values: 'No cure claims' }, offers: [] });
  const history = await customer.brandHistory();
  assert.deepEqual(history.map((v) => [v.version, v.approved_by, v.reason, v.restored_from]), [
    [3, 'bob', 'Undo', 1], [2, 'ada', 'Five edits shortened the hook', null], [1, 'ada', 'First', null],
  ]);
  assert.deepEqual(history[1].signals, ['p1', 'p2']);
  await assert.rejects(customer.brandChange('ada', { approved: true, base_version: 3, reason: 'x', offers: [{ id: 'Bad Id', name: 'x', pattern: 'series' }] }), /lower-case/);
});

test('a piece is planned with its tracked link, and every signal is kept', async () => {
  const { customer } = await readyCustomer();
  await assert.rejects(customer.pieceSave('ada', { signal: 'planned', week: '2026-W47', offer: 'nope', format: 'teaser', kind: 'reel' }), /No offer nope/);
  await assert.rejects(customer.pieceSave('ada', { signal: 'planned', week: '2026-W47', offer: 'table', format: 'teaser', kind: 'reel' }), /destination/);
  const planned = await customer.pieceSave('ada', {
    signal: 'planned', week: '2026-W47', offer: 'table', format: 'teaser', kind: 'reel', destination: 'https://luma.com/table-nov',
  });
  assert.equal(planned.id, 'p1');
  assert.equal(planned.audience, 'primary');
  assert.equal(planned.brand_version, 1);
  assert.deepEqual(planned.links, { instagram: 'https://luma.com/table-nov?utm_source=instagram&utm_medium=social&utm_campaign=table&utm_content=p1' });

  await assert.rejects(customer.pieceSave('ada', { id: 'p1', signal: 'approved' }), /Save the draft/);
  await customer.pieceSave('ada', { id: 'p1', signal: 'drafted', brief: 'Hook A' });
  await customer.pieceSave('ada', { id: 'p1', signal: 'edited', brief: 'Hook B' });
  await assert.rejects(customer.pieceSave('ada', { id: 'p1', signal: 'posted' }), /approved/);
  await customer.pieceSave('ada', { id: 'p1', signal: 'rejected', reason: 'weak_hook', note: 'Too slow' });
  await customer.pieceSave('ada', { id: 'p1', signal: 'edited', brief: 'Hook C' });
  const approved = await customer.pieceSave('ada', { id: 'p1', signal: 'approved' });
  assert.equal(approved.approved, 'Hook C');
  assert.equal(approved.rejection, null);
  const posted = await customer.pieceSave('ada', { id: 'p1', signal: 'posted', posted_at: '2026-11-10' });
  assert.equal(posted.status, 'posted');
  assert.equal(posted.posts[0].at, '2026-11-10');
  await assert.rejects(customer.pieceSave('ada', { id: 'p1', signal: 'reported', numbers: { vibes: 3 } }), /vibes/);
  await assert.rejects(customer.pieceSave('ada', { id: 'p1', signal: 'reported', numbers: { revenue: 30 } }), /currency/);
  const reported = await customer.pieceSave('ada', { id: 'p1', signal: 'reported', numbers: { views: 1200, skip_rate: 0.4 } });
  assert.deepEqual(reported.reported, { views: 1200, skip_rate: 0.4 });

  const signals = await customer.signals('p1');
  assert.deepEqual(signals.map((s) => s.kind), ['planned', 'drafted', 'edited', 'rejected', 'edited', 'approved', 'posted', 'reported']);
  assert.deepEqual(signals[2].data, { brief: 'Hook B' });
  assert.deepEqual(signals[3].data, { reason: 'weak_hook', note: 'Too slow' });
  assert.deepEqual((await customer.piecesList({ status: 'posted' })).map((p) => p.id), ['p1']);
  assert.deepEqual(await customer.piecesList({ week: '2026-W48' }), []);
});

test('offers come with upcoming events, and past ones when asked', async () => {
  const { customer, calls } = await readyCustomer();
  const found = await customer.offersList();
  assert.equal(found.calendar, 'Table calendar');
  assert.deepEqual(found.offers.map((o) => o.id), ['table']);
  assert.deepEqual(found.upcoming.map((e) => e.id), ['evt-1', 'evt-2']);
  assert.deepEqual(found.past, []);
  assert.ok(calls.filter((c) => c.call === 'list').every((c) => c.key === CALENDAR_KEY), 'the key is opened only to call the vendor');
  await customer.offersList({ past_days: 365 });
  assert.equal(calls.filter((c) => c.call === 'list').length, 3);

  const { customer: bare } = newCustomer();
  assert.deepEqual(await bare.offersList(), { offers: [], upcoming: [], past: [], calendar: null });
});

test('results join each piece to its registrations, beside what the person reported', async () => {
  const { customer } = await readyCustomer({
    'evt-1': [guest('p1', 2500, true), guest('p1', 2500), guest('p2'), guest(null), guest('px-unknown')],
    'evt-2': [guest('p1', 2500)],
  });
  const plan = { signal: 'planned' as const, week: '2026-W46', offer: 'table', kind: 'reel', destination: 'https://luma.com/table-nov' };
  await customer.pieceSave('ada', { ...plan, format: 'teaser' });
  await customer.pieceSave('ada', { ...plan, format: 'spotlight', audience: 'secondary' });
  for (const id of ['p1', 'p2']) {
    await customer.pieceSave('ada', { id, signal: 'drafted', brief: 'b' });
    await customer.pieceSave('ada', { id, signal: 'approved' });
    await customer.pieceSave('ada', { id, signal: 'posted', posted_at: '2026-11-10' });
  }
  await customer.pieceSave('ada', { id: 'p1', signal: 'reported', numbers: { views: 900 } });

  const results = await customer.resultsRead({ from: '2026-11-09', to: '2026-11-15' });
  assert.equal(results.event_platform, 'read');
  assert.deepEqual(results.pieces.map((p) => [p.id, p.events?.registrations, p.events?.check_ins, p.events?.revenue]), [
    ['p1', 3, 1, { amount: 75, currency: 'USD' }],
    ['p2', 1, 0, { amount: 0, currency: 'USD' }],
  ]);
  assert.deepEqual(results.by_format, {
    teaser: { pieces: 1, registrations: 3, check_ins: 1, views: 900, reported_conversions: 0 },
    spotlight: { pieces: 1, registrations: 1, check_ins: 0, views: 0, reported_conversions: 0 },
  });
  assert.equal(results.by_offer.table.pieces, 2);
  assert.deepEqual(results.unattributed, { registrations: 2, check_ins: 0, revenue: null });
  assert.equal((await customer.piecesList())[0].results?.registrations, 3, 'the counts are kept with the piece');

  const none = await customer.resultsRead({ from: '2026-10-01', to: '2026-10-07' });
  assert.deepEqual(none.pieces, []);
  await assert.rejects(customer.resultsRead({ from: '2026-11-15', to: '2026-11-09' }), /on or before/);
});

test('export holds every record and no credential, and erasing leaves nothing', async () => {
  const { customer, sql } = await readyCustomer();
  await customer.pieceSave('ada', { signal: 'planned', week: '2026-W47', offer: 'table', format: 'recap', kind: 'carousel', destination: 'https://luma.com/table-nov' });
  const exported = await customer.exportAll();
  const record = JSON.parse(exported.json);
  assert.equal(record.users[0].person, 'ada');
  assert.equal(record.connections[0].name, 'Table calendar');
  assert.equal(record.brand.length, 1);
  assert.equal(record.pieces[0].signals.length, 1);
  assert.doesNotMatch(exported.json + exported.markdown, new RegExp(CALENDAR_KEY));
  assert.match(exported.markdown, /## voice\n\nWarm, plain, short\./);
  assert.match(exported.markdown, /\*\*Table\*\* \(`table`, series\)/);

  await customer.erase();
  for (const table of ['users', 'settings', 'connections', 'links', 'brand', 'pieces', 'signals']) {
    assert.deepEqual(sql.all(`SELECT * FROM ${table}`), [], `${table} is empty`);
  }
  assert.equal(await customer.isUser('ada'), false);
});
