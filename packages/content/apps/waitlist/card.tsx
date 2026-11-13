// The waitlist card (ADR-0049): the brand's waitlist, ranked by engagement, to sort, filter and search,
// with Activate on each waiting person and Decline or Restore behind a tap. Each change is a call to
// the server's own tool, and the list redraws from the waitlist it answers.
import { useState } from 'react';
import { Badge } from '../ui/badge.tsx';
import { Button } from '../ui/button.tsx';
import { cn } from '../ui/cn.ts';
import { Notice } from '../ui/notice.tsx';
import { counts, engagement, FILTERS, plural, shown, SORTS, stateOf, type Filter, type Person, type Sort } from './list.ts';

/** How many rows show before "Show more". */
const PAGE = 20;

export type Change = { tool: 'waitlist_activate' | 'waitlist_decline'; email: string; restore?: boolean };
export type Outcome = { tone: 'info' | 'warning' | 'error'; text: string };

export function WaitlistCard({ people, change }: {
  people: Person[] | null;
  /** Makes one change on the server, and answers what to tell the person. */
  change(c: Change): Promise<Outcome>;
}) {
  const [filter, setFilter] = useState<Filter>('waiting');
  const [sort, setSort] = useState<Sort>('engaged');
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [limit, setLimit] = useState(PAGE);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<Outcome | null>(null);

  if (people === null) return <p className="p-4 text-muted">Loading the waitlist…</p>;

  const total = counts(people);
  const list = shown(people, filter, sort, search);
  const act = async (c: Change) => {
    setBusy(c.email);
    setNotice(await change(c));
    setBusy(null);
    setOpen(null);
  };

  return (
    <div className="flex flex-col gap-3 p-3 sm:p-4">
      <header className="flex items-baseline justify-between gap-3">
        <h2 className="m-0 font-display text-lg font-semibold tracking-tight">Waitlist</h2>
        <span className="text-xs text-muted">{plural(people.length, 'person', 'people')}</span>
      </header>

      {notice && <Notice tone={notice.tone} onDismiss={() => setNotice(null)}>{notice.text}</Notice>}

      <div role="group" aria-label="Show" className="flex gap-1 rounded-full bg-sunk p-1">
        {FILTERS.map((f) => (
          <button key={f.value} type="button" aria-pressed={filter === f.value}
            onClick={() => { setFilter(f.value); setLimit(PAGE); setOpen(null); }}
            className={cn('flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-full px-2 py-1.5 text-xs font-medium',
              filter === f.value ? 'bg-surface text-ink shadow-sm' : 'text-muted hover:text-ink')}>
            {f.label}<span className="tabular-nums opacity-70">{total[f.value]}</span>
          </button>
        ))}
      </div>

      <div className="flex gap-2">
        <label className="sr-only" htmlFor="waitlist-search">Search by address or handle</label>
        <input id="waitlist-search" type="search" value={search} placeholder="Search address or @handle"
          onChange={(e) => { setSearch(e.target.value); setLimit(PAGE); }}
          className="h-9 min-w-0 flex-1 rounded-full border border-line bg-surface px-3.5 text-sm text-ink placeholder:text-muted" />
        <label className="sr-only" htmlFor="waitlist-sort">Sort</label>
        <select id="waitlist-sort" value={sort} onChange={(e) => setSort(e.target.value as Sort)}
          className="h-9 shrink-0 cursor-pointer rounded-full border border-line bg-surface px-3 text-xs text-ink">
          {SORTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
      </div>

      {list.length === 0 ? (
        <p className="m-0 rounded-md border border-dashed border-line px-4 py-6 text-center text-sm text-muted">
          {search ? 'Nobody here matches that search.' : filter === 'waiting' ? 'Nobody is waiting.' : `Nobody is ${filter}.`}
        </p>
      ) : (
        <ul className="m-0 flex list-none flex-col divide-y divide-line overflow-hidden rounded-md border border-line bg-surface p-0">
          {list.slice(0, limit).map((p) => (
            <Row key={p.email} person={p} open={open === p.email} busy={busy === p.email}
              toggle={() => setOpen(open === p.email ? null : p.email)} act={act} />
          ))}
        </ul>
      )}

      {list.length > limit && (
        <Button variant="ghost" size="md" onClick={() => setLimit(limit + PAGE)}>
          Show {Math.min(PAGE, list.length - limit)} more of {list.length - limit}
        </Button>
      )}
    </div>
  );
}

function Row({ person: p, open, busy, toggle, act }: {
  person: Person;
  open: boolean;
  busy: boolean;
  toggle(): void;
  act(c: Change): void;
}) {
  const state = stateOf(p);
  const score = engagement(p);
  const details = `waitlist-${p.email.replace(/[^a-z0-9]/gi, '-')}`;
  return (
    <li className="flex flex-col">
      <div className="flex items-center gap-2 px-3 py-2.5">
        <button type="button" onClick={toggle} aria-expanded={open} aria-controls={details}
          className="flex min-w-0 flex-1 cursor-pointer flex-col items-start gap-0.5 text-left">
          <span className="w-full truncate font-medium">{p.instagram ? `@${p.instagram}` : p.email}</span>
          <span className="w-full truncate text-xs text-muted">
            {plural(p.referrals, 'referral')} · {plural(p.engaged, 'Reel')}
          </span>
        </button>
        {score > 0 && <Badge variant="quiet" title="Referrals plus Reels commented on">{score}</Badge>}
        {state === 'waiting' && (
          <Button variant="primary" disabled={busy} onClick={() => act({ tool: 'waitlist_activate', email: p.email })}>
            {busy ? 'Activating…' : 'Activate'}
          </Button>
        )}
        {state === 'activated' && <Badge variant="accent">Activated</Badge>}
        {state === 'declined' && <Badge variant="problem">Declined</Badge>}
      </div>
      {open && (
        <div id={details} className="flex flex-col gap-2 border-t border-line bg-bg/60 px-3 py-3 text-xs">
          <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
            <dt className="text-muted">Address</dt><dd className="m-0 break-all">{p.email}</dd>
            <dt className="text-muted">Instagram</dt><dd className="m-0">{p.instagram ? `@${p.instagram}, proved by comment` : 'Not proved yet'}</dd>
            <dt className="text-muted">Joined</dt><dd className="m-0">{p.joined.slice(0, 10)}</dd>
            {p.activated && <><dt className="text-muted">Activated</dt><dd className="m-0">{p.activated.slice(0, 10)}</dd></>}
            {p.declined && <><dt className="text-muted">Declined</dt><dd className="m-0">{p.declined.slice(0, 10)}</dd></>}
            {Object.keys(p.source).length > 0 && <><dt className="text-muted">Came from</dt>
              <dd className="m-0 break-all">{Object.entries(p.source).map(([k, v]) => `${k}=${v}`).join(', ')}</dd></>}
          </dl>
          {state === 'waiting' && (
            <div className="flex justify-end">
              <Button variant="outline" disabled={busy} onClick={() => act({ tool: 'waitlist_decline', email: p.email })}>Decline</Button>
            </div>
          )}
          {state === 'declined' && (
            <div className="flex justify-end">
              <Button variant="outline" disabled={busy} onClick={() => act({ tool: 'waitlist_decline', email: p.email, restore: true })}>Restore</Button>
            </div>
          )}
        </div>
      )}
    </li>
  );
}
