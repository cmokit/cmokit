// The waitlist card (ADR-0049), in two views. Inline in the conversation it fits its content, with no
// scrolling of its own and two buttons, as Claude's guidelines ask: how many are waiting, the five most
// engaged, "Activate these 5" (a second tap confirms) and "Open full list". Full screen, the whole
// waitlist filters, searches and sorts, with Activate and Decline or Restore on each person.
// Each change is a call to the server's own tool, and both views redraw from the waitlist it answers.
import { useState, type ReactNode } from 'react';
import { Badge } from '../ui/badge.tsx';
import { Button } from '../ui/button.tsx';
import { cn } from '../ui/cn.ts';
import { Notice } from '../ui/notice.tsx';
import { counts, engagement, FILTERS, plural, shown, SORTS, stateOf, type Filter, type Person, type Sort } from './list.ts';

/** How many of the most engaged waiting people the inline card shows. */
export const TOP = 5;

export type View = 'summary' | 'full';
export type Change = { tool: 'waitlist_activate' | 'waitlist_decline'; email: string; restore?: boolean };
export type Outcome = { tone: 'info' | 'warning' | 'error'; text: string };

export function WaitlistCard({ people, change, view, expand }: {
  people: Person[] | null;
  /** Makes one change on the server, and answers what to tell the person. */
  change(c: Change): Promise<Outcome>;
  view: View;
  /** Opens the full list. Called straight from the button's click, as Claude asks for full screen. */
  expand(): void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<Outcome | null>(null);

  if (people === null) return <Skeleton />;

  const act = async (c: Change) => {
    setBusy(c.email);
    setNotice(await change(c));
    setBusy(null);
  };
  // One call per person, in order, as the server's tool takes one address.
  const activate = async (emails: string[]) => {
    setBusy('all');
    const failed: Outcome[] = [];
    for (const email of emails) {
      const outcome = await change({ tool: 'waitlist_activate', email });
      if (outcome.tone === 'error') failed.push(outcome);
    }
    const done = emails.length - failed.length;
    setNotice(failed.length
      ? { tone: 'error', text: `Activated ${plural(done, 'person', 'people')}. ${failed.length} failed: ${failed[0].text}` }
      : { tone: 'info', text: `Activated ${plural(done, 'person', 'people')}. CMO Kit sends no email yet, so tell them yourself.` });
    setBusy(null);
  };
  const banner = notice && <Notice tone={notice.tone} onDismiss={() => setNotice(null)}>{notice.text}</Notice>;
  return view === 'full'
    ? <Full people={people} busy={busy} act={act} notice={banner} />
    : <Summary people={people} busy={busy} notice={banner} activate={activate} expand={expand} />;
}

type Shared = { people: Person[]; busy: string | null; act(c: Change): void; notice: ReactNode };

function Summary({ people, busy, notice, activate, expand }: Omit<Shared, 'act'> & {
  activate(emails: string[]): Promise<void>;
  expand(): void;
}) {
  const [confirming, setConfirming] = useState(false);
  const total = counts(people);
  const top = shown(people, 'waiting', 'engaged').slice(0, TOP);
  const these = top.length === 1 ? 'this 1' : `these ${top.length}`;
  return (
    <div className="flex flex-col gap-3 p-3 sm:p-4">
      <header className="flex flex-col gap-0.5">
        <h2 className="m-0 font-display text-lg font-semibold tracking-tight">Waitlist</h2>
        <p className="m-0 text-xs text-muted">
          {total.waiting} waiting · {total.activated} activated · {total.declined} declined
        </p>
      </header>
      {notice}
      {top.length === 0 ? (
        <p className="m-0 rounded-md border border-dashed border-line px-4 py-5 text-center text-sm text-muted">Nobody is waiting.</p>
      ) : (
        <ul aria-label={`The ${top.length} most engaged waiting`}
          className="m-0 flex list-none flex-col divide-y divide-line rounded-md border border-line bg-surface p-0">
          {top.map((p) => (
            <li key={p.email} className="flex items-center gap-2 px-3 py-2">
              <Who person={p} />
              {engagement(p) > 0 && <Badge variant="quiet" title="Referrals plus Reels commented on">{engagement(p)}</Badge>}
            </li>
          ))}
        </ul>
      )}
      {confirming && (
        <p className="m-0 text-xs text-muted">They get no email from CMO Kit, and the card can't undo an activation. Tap again to activate {these}.</p>
      )}
      <div className="flex gap-2">
        {top.length > 0 && (
          <Button variant="primary" size="md" className="flex-1" disabled={busy !== null}
            onClick={async () => {
              if (!confirming) return setConfirming(true);
              setConfirming(false);
              await activate(top.map((p) => p.email));
            }}>
            {busy ? 'Activating…' : confirming ? `Confirm: activate ${top.length}` : `Activate ${these}`}
          </Button>
        )}
        {people.length > 0 && (
          <Button variant="outline" size="md" className="flex-1" onClick={() => { setConfirming(false); expand(); }}>Open full list</Button>
        )}
      </div>
    </div>
  );
}

function Full({ people, busy, act, notice }: Shared) {
  const [filter, setFilter] = useState<Filter>('waiting');
  const [sort, setSort] = useState<Sort>('engaged');
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const total = counts(people);
  const list = shown(people, filter, sort, search);

  return (
    <div className="flex flex-col gap-3 p-3 sm:p-4">
      <header className="flex items-baseline justify-between gap-3">
        <h2 className="m-0 font-display text-lg font-semibold tracking-tight">Waitlist</h2>
        <span className="text-xs text-muted">{plural(people.length, 'person', 'people')}</span>
      </header>
      {notice}
      <Segmented<Filter> label="Show" value={filter} onChange={(f) => { setFilter(f); setOpen(null); }}
        options={FILTERS.map((f) => ({ ...f, count: total[f.value] }))} />
      <label className="sr-only" htmlFor="waitlist-search">Search by address or handle</label>
      <input id="waitlist-search" type="search" value={search} placeholder="Search address or @handle"
        onChange={(e) => setSearch(e.target.value)}
        className="h-11 min-w-0 rounded-full border border-line bg-surface px-4 text-sm text-ink placeholder:text-muted" />
      <Segmented<Sort> label="Sort" value={sort} onChange={setSort} options={SORTS} />

      {list.length === 0 ? (
        <p className="m-0 rounded-md border border-dashed border-line px-4 py-6 text-center text-sm text-muted">
          {search ? 'Nobody here matches that search.' : filter === 'waiting' ? 'Nobody is waiting.' : `Nobody is ${filter}.`}
        </p>
      ) : (
        <ul className="m-0 flex list-none flex-col divide-y divide-line rounded-md border border-line bg-surface p-0">
          {list.map((p) => (
            <Row key={p.email} person={p} open={open === p.email} busy={busy === p.email}
              toggle={() => setOpen(open === p.email ? null : p.email)} act={act} />
          ))}
        </ul>
      )}
    </div>
  );
}

/** Visible choices in place of a menu, which Claude's guidelines ask cards to avoid. */
function Segmented<T extends string>({ label, value, onChange, options }: {
  label: string;
  value: T;
  onChange(value: T): void;
  options: { value: T; label: string; count?: number }[];
}) {
  return (
    <div role="group" aria-label={label} className="flex gap-1 rounded-full bg-sunk p-1">
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={value === o.value} onClick={() => onChange(o.value)}
          className={cn('flex min-h-9 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-full px-2 text-xs font-medium',
            value === o.value ? 'bg-surface text-ink shadow-sm' : 'text-muted hover:text-ink')}>
          {o.label}{o.count !== undefined && <span className="tabular-nums opacity-70">{o.count}</span>}
        </button>
      ))}
    </div>
  );
}

function Who({ person: p }: { person: Person }) {
  return (
    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
      <span className="truncate font-medium">{p.instagram ? `@${p.instagram}` : p.email}</span>
      <span className="truncate text-xs text-muted">{plural(p.referrals, 'referral')} · {plural(p.engaged, 'Reel')}</span>
    </span>
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
      <div className="flex items-center gap-2 px-3 py-2">
        <button type="button" onClick={toggle} aria-expanded={open} aria-controls={details}
          className="flex min-h-11 min-w-0 flex-1 cursor-pointer text-left"><Who person={p} /></button>
        {score > 0 && <Badge variant="quiet" title="Referrals plus Reels commented on">{score}</Badge>}
        {state === 'waiting' && (
          <Button variant="primary" size="md" disabled={busy} onClick={() => act({ tool: 'waitlist_activate', email: p.email })}>
            {busy ? 'Saving…' : 'Activate'}
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
          {state !== 'activated' && (
            <div className="flex justify-end">
              <Button variant="outline" size="md" disabled={busy}
                onClick={() => act({ tool: 'waitlist_decline', email: p.email, ...(state === 'declined' ? { restore: true } : {}) })}>
                {state === 'waiting' ? 'Decline' : 'Restore'}
              </Button>
            </div>
          )}
        </div>
      )}
    </li>
  );
}

/** A skeleton in the summary's shape while the waitlist loads, as Claude's guidelines prefer to a spinner. */
function Skeleton() {
  return (
    <div className="flex flex-col gap-3 p-3 sm:p-4" aria-busy="true" aria-label="Loading the waitlist">
      <div className="h-5 w-24 rounded bg-sunk" />
      <div className="h-3 w-44 rounded bg-sunk" />
      <div className="flex flex-col divide-y divide-line rounded-md border border-line">
        {[0, 1, 2].map((i) => <div key={i} className="h-14" />)}
      </div>
    </div>
  );
}
