// The events interface (ADR-0032): an event platform's upcoming and past events, and an event's
// registrations counted per piece. An adapter reads each guest and passes on only the facts counted
// here, so nothing about a guest (a name, an address, an answer) leaves the adapter.

export interface EventSummary {
  id: string;
  name: string;
  /** The event's own page, a piece's destination. */
  url: string;
  start: string;
  end: string | null;
  timezone: string | null;
  /** Where it is held, as the platform names it, or null for an online event or none given. */
  venue: string | null;
  /** The capacity and places remaining, only where the platform states them. */
  capacity: number | null;
  remaining: number | null;
}

/** What an adapter passes on about one guest, and nothing more. */
export interface GuestFacts {
  registered: boolean;
  checkedIn: boolean;
  /** The `utm_content` the guest's registration link carried, or null. */
  content: string | null;
  /** What the guest paid, in minor units of the currency, less tax, discounts and refunds. */
  revenue: number;
  currency: string | null;
}

export interface Count {
  registrations: number;
  checkIns: number;
  /** In minor units of the event's currency. */
  revenue: number;
}

export interface Tally {
  currency: string | null;
  /** Counts by the `utm_content` of each registration. */
  byContent: Record<string, Count>;
  /** Registrations with no `utm_content`. */
  unattributed: Count;
}

export interface Events {
  /** The vendor's id, kept with the connection. */
  readonly vendor: string;
  /** The vendor's name, as the key-entry page shows it. */
  readonly label: string;
  /** Where the person finds the key, in a sentence for the key-entry page. */
  readonly keyHelp: string;
  /** Checks a key, returning the calendar it reaches, or undefined when the vendor refuses it. */
  verify(key: string): Promise<{ id: string; name: string } | undefined>;
  /** Events starting within a range, oldest first. */
  list(key: string, range: { after?: string; before?: string }): Promise<EventSummary[]>;
  tally(key: string, eventId: string): Promise<Tally>;
}

const zero = (): Count => ({ registrations: 0, checkIns: 0, revenue: 0 });

/** Counts registrations, check-ins and revenue per `utm_content`. */
export function tally(guests: GuestFacts[]): Tally {
  const found: Tally = { currency: null, byContent: {}, unattributed: zero() };
  for (const guest of guests) {
    if (!guest.registered) continue;
    const count = guest.content ? (found.byContent[guest.content] ??= zero()) : found.unattributed;
    count.registrations += 1;
    if (guest.checkedIn) count.checkIns += 1;
    count.revenue += guest.revenue;
    found.currency ??= guest.currency;
  }
  return found;
}
