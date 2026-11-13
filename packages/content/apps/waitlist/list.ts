// What the waitlist card shows, without React: who is in each filter, in which order. The server
// answers the waitlist already ranked by engagement, so "engaged" keeps its order.
import type { WaitlistEntry } from '../../src/customer.ts';

export type Person = WaitlistEntry;
export type Filter = 'waiting' | 'activated' | 'declined';
export type Sort = 'engaged' | 'newest' | 'oldest';

export const FILTERS: { value: Filter; label: string }[] = [
  { value: 'waiting', label: 'Waiting' },
  { value: 'activated', label: 'Activated' },
  { value: 'declined', label: 'Declined' },
];

export const SORTS: { value: Sort; label: string }[] = [
  { value: 'engaged', label: 'Most engaged' },
  { value: 'newest', label: 'Newest' },
  { value: 'oldest', label: 'Oldest' },
];

/** Which filter a person falls in: declined people show only under Declined. */
export function stateOf(person: Person): Filter {
  if (person.activated) return 'activated';
  if (person.declined) return 'declined';
  return 'waiting';
}

/** Referrals plus Reels commented on, as the server ranks by. */
export const engagement = (person: Person): number => person.referrals + person.engaged;

export function counts(people: Person[]): Record<Filter, number> {
  const all: Record<Filter, number> = { waiting: 0, activated: 0, declined: 0 };
  for (const person of people) all[stateOf(person)] += 1;
  return all;
}

/** The people one filter, a search and a sort show, in order. */
export function shown(people: Person[], filter: Filter, sort: Sort, search = ''): Person[] {
  const term = search.trim().toLowerCase().replace(/^@/, '');
  const kept = people.filter((p) => stateOf(p) === filter
    && (!term || p.email.toLowerCase().includes(term) || (p.instagram ?? '').toLowerCase().includes(term)));
  if (sort === 'engaged') return kept;
  const sign = sort === 'newest' ? -1 : 1;
  return [...kept].sort((a, b) => sign * a.joined.localeCompare(b.joined));
}

/** A count with its noun, as "1 referral" or "3 Reels". */
export const plural = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`;
