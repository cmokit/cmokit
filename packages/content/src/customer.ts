// One customer's records, as its Durable Object holds them (ADR-0030): its users, its access, its
// connections with their credentials sealed, the brand context's versions (ADR-0023), and its pieces
// with their signals (ADR-0025) and result counts. Events are never stored; they are read from the
// event platform when a plan is made or results are read (ADR-0032). Written against the SQL
// interface, so it runs on the Durable Object's storage and on Node's SQLite alike.

import type { EventSummary, Events, Tally } from './events.ts';
import { PLATFORMS, destinationProblem, trackedLink, type Platform } from './links.ts';
import type { Sql } from './sql.ts';
import { hash, randomToken, type Vault } from './vault.ts';

/** The brand context's sections, as `CNT-01` lists them; what the brand sells is its offers. */
export const SECTIONS = ['positioning', 'audiences', 'values', 'voice', 'examples', 'ai_tells'] as const;
export type Section = (typeof SECTIONS)[number];

/**
 * How a promotable thing recurs: a one-off or annual launch, a recurring series, a distinct event, a
 * format offered on an open schedule, or a product.
 */
export const PATTERNS = ['launch', 'series', 'event', 'format', 'product'] as const;
export const FORMATS = ['teaser', 'spotlight', 'recap', 'community_question'] as const;
export const KINDS = ['reel', 'carousel', 'photo', 'story'] as const;
export const AUDIENCES = ['primary', 'secondary'] as const;
export const SIGNALS = ['planned', 'drafted', 'shown', 'edited', 'approved', 'rejected', 'posted', 'reported'] as const;
export const REJECTIONS = ['off_voice', 'wrong_offer', 'wrong_audience', 'weak_hook', 'inaccurate', 'other'] as const;
/** The numbers a person may report from a platform or a destination with no adapter. */
export const NUMBERS = [
  'views', 'reach', 'likes', 'comments', 'shares', 'saves', 'follows', 'profile_visits', 'link_clicks',
  'sticker_taps', 'skip_rate', 'average_watch_seconds', 'conversions', 'revenue',
] as const;

/** A promotable thing: what `utm_campaign` names on every piece that promotes it. */
export interface Offer {
  id: string;
  name: string;
  pattern: (typeof PATTERNS)[number];
  /** Where a piece sends people when no single event's page does, such as a product's page. */
  destination?: string;
  /** Titles, past and present, of the events that belong to it. */
  aliases?: string[];
  /** False for a thing the person asked never to promote. */
  promote?: boolean;
  notes?: string;
}

export interface BrandContext {
  sections: Partial<Record<Section, string>>;
  offers: Offer[];
}

export interface BrandVersion {
  version: number;
  context: BrandContext;
  approved_by: string;
  at: string;
  reason: string;
  signals: string[];
  restored_from: number | null;
}

export interface Piece {
  id: string;
  week: string;
  offer: string;
  format: (typeof FORMATS)[number];
  kind: (typeof KINDS)[number];
  audience: (typeof AUDIENCES)[number];
  destination: string;
  platforms: Platform[];
  status: 'planned' | 'drafted' | 'approved' | 'rejected' | 'posted';
  brand_version: number | null;
  brief: string | null;
  approved: string | null;
  rejection: { reason: string; note: string | null } | null;
  posts: { platform: Platform; at: string; url: string | null }[];
  reported: Partial<Record<(typeof NUMBERS)[number], number>> & { currency?: string };
  results: { registrations: number; check_ins: number; revenue: Money | null; read_at: string } | null;
  links: Partial<Record<Platform, string>>;
  created_at: string;
  updated_at: string;
}

export interface Money {
  amount: number;
  currency: string;
}

/** A refusal the person or the model can act on, as opposed to a fault. */
export class Refusal extends Error {}

export interface CustomerDeps {
  vault: Vault;
  /** The event platform's adapter. */
  events: Events;
  now?(): number;
  newId?(): string;
}

/** How long a one-time link to connect something works, and how far ahead upcoming events are read. */
const LINK_MS = 15 * 60_000;
const AHEAD_DAYS = 120;
const DAY = 86_400_000;

const SCHEMA = [
  'CREATE TABLE IF NOT EXISTS users (person TEXT PRIMARY KEY, added_at INTEGER NOT NULL)',
  'CREATE TABLE IF NOT EXISTS settings (name TEXT PRIMARY KEY, value TEXT NOT NULL)',
  `CREATE TABLE IF NOT EXISTS connections (vendor TEXT PRIMARY KEY, identifier TEXT NOT NULL, name TEXT NOT NULL,
    sealed TEXT NOT NULL, connected_by TEXT NOT NULL, connected_at INTEGER NOT NULL)`,
  'CREATE TABLE IF NOT EXISTS links (hash TEXT PRIMARY KEY, person TEXT NOT NULL, vendor TEXT NOT NULL, expires_at INTEGER NOT NULL)',
  `CREATE TABLE IF NOT EXISTS brand (version INTEGER PRIMARY KEY, context TEXT NOT NULL, approved_by TEXT NOT NULL,
    at INTEGER NOT NULL, reason TEXT NOT NULL, signals TEXT NOT NULL, restored_from INTEGER)`,
  'CREATE TABLE IF NOT EXISTS pieces (id TEXT PRIMARY KEY, record TEXT NOT NULL)',
  `CREATE TABLE IF NOT EXISTS signals (piece TEXT NOT NULL, at INTEGER NOT NULL, kind TEXT NOT NULL,
    person TEXT NOT NULL, data TEXT NOT NULL)`,
  'CREATE TABLE IF NOT EXISTS terms (person TEXT NOT NULL, version TEXT NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (person, version))',
];
const TABLES = ['users', 'settings', 'connections', 'links', 'brand', 'pieces', 'signals', 'terms'];
/** The one-time link to accept the server's terms is kept with the links to connect a vendor. */
const TERMS = 'terms';

export class Customer {
  readonly #sql: Sql;
  readonly #deps: CustomerDeps;
  readonly #now: () => number;
  readonly #newId: () => string;

  constructor(sql: Sql, deps: CustomerDeps) {
    this.#sql = sql;
    this.#deps = deps;
    this.#now = deps.now ?? Date.now;
    this.#newId = deps.newId ?? (() => `p${randomToken().replace(/[^a-z0-9]/g, '').slice(0, 9)}`);
    for (const statement of SCHEMA) sql.all(statement);
  }

  // Users and access.

  async addUser(person: string): Promise<void> {
    this.#sql.all('INSERT OR IGNORE INTO users (person, added_at) VALUES (?, ?)', person, this.#now());
  }

  async isUser(person: string): Promise<boolean> {
    return this.#sql.all('SELECT 1 FROM users WHERE person = ?', person).length > 0;
  }

  /** Access as the lifecycle last set it (ADR-0017); a self-hosted customer with none set has access. */
  async setAccess(access: 'active' | 'trial' | 'lapsed'): Promise<void> {
    this.#set('access', access);
  }

  async access(): Promise<'active' | 'trial' | 'lapsed'> {
    return (this.#setting('access') ?? 'active') as 'active' | 'trial' | 'lapsed';
  }

  /** What the lifecycle calls at a customer's first checkout: the person who paid is its first user. */
  async provision(person: string, billing: string): Promise<void> {
    await this.addUser(person);
    this.#set('billing', billing);
  }

  /** The customer's id at the payment processor, if it subscribed through the lifecycle. */
  async billing(): Promise<string | undefined> {
    return this.#setting('billing');
  }

  #set(name: string, value: string): void {
    this.#sql.all('INSERT INTO settings (name, value) VALUES (?, ?) ON CONFLICT (name) DO UPDATE SET value = excluded.value', name, value);
  }

  #setting(name: string): string | undefined {
    return this.#sql.all('SELECT value FROM settings WHERE name = ?', name)[0]?.value as string | undefined;
  }

  // Setup (ADR-0019).

  /** What is connected and what is missing, with a one-time link to connect each missing thing. */
  async status(person: string, base: string) {
    const access = await this.access();
    const connections = this.#sql.all('SELECT vendor, name, connected_at FROM connections').map((row) => ({
      vendor: row.vendor as string, calendar: row.name as string, connected_at: iso(row.connected_at as number),
    }));
    const missing = [];
    const { events } = this.#deps;
    if (!connections.some((c) => c.vendor === events.vendor)) {
      missing.push({
        what: 'event platform', vendor: events.vendor, label: events.label, optional: true,
        link: `${base}/connect?t=${await this.#link(person, events.vendor)}`,
        expires: iso(this.#now() + LINK_MS),
      });
    }
    return { access, connections, missing };
  }

  async #link(person: string, vendor: string): Promise<string> {
    const token = randomToken();
    this.#sql.all('DELETE FROM links WHERE expires_at <= ?', this.#now());
    this.#sql.all('INSERT INTO links (hash, person, vendor, expires_at) VALUES (?, ?, ?, ?)', await hash(token), person, vendor, this.#now() + LINK_MS);
    return token;
  }

  /** The vendor a one-time link is for, while it is unused and unexpired. */
  async linkFor(token: string): Promise<{ vendor: string; label: string; help: string } | undefined> {
    const row = this.#sql.all('SELECT vendor FROM links WHERE hash = ? AND vendor <> ? AND expires_at > ?', await hash(token), TERMS, this.#now())[0];
    if (!row) return undefined;
    return { vendor: row.vendor as string, label: this.#deps.events.label, help: this.#deps.events.keyHelp };
  }

  /**
   * Checks a key given on the one-time page with its vendor, and keeps it sealed. The link is used up
   * only when the key works, so a mistyped key can be entered again until the link expires.
   */
  async connect(token: string, key: string): Promise<{ ok: true; calendar: string } | { ok: false; problem: string }> {
    const tokenHash = await hash(token);
    const row = this.#sql.all('SELECT person, vendor FROM links WHERE hash = ? AND vendor <> ? AND expires_at > ?', tokenHash, TERMS, this.#now())[0];
    if (!row) return { ok: false, problem: 'This link has expired or was already used. Ask Claude for a new one.' };
    const { events, vault } = this.#deps;
    const calendar = await events.verify(key.trim());
    if (!calendar) return { ok: false, problem: `${events.label} did not accept that key. Check it and try again.` };
    this.#sql.all(
      `INSERT INTO connections (vendor, identifier, name, sealed, connected_by, connected_at) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT (vendor) DO UPDATE SET identifier = excluded.identifier, name = excluded.name, sealed = excluded.sealed,
       connected_by = excluded.connected_by, connected_at = excluded.connected_at`,
      events.vendor, calendar.id, calendar.name, await vault.seal(key.trim()), row.person as string, this.#now(),
    );
    this.#sql.all('DELETE FROM links WHERE hash = ?', tokenHash);
    return { ok: true, calendar: calendar.name };
  }

  // The server's terms, as a closed beta's (ADR-0039).

  /** Whether the person accepted this version of the terms. */
  async termsAccepted(person: string, version: string): Promise<boolean> {
    return this.#sql.all('SELECT 1 FROM terms WHERE person = ? AND version = ?', person, version).length > 0;
  }

  /** A one-time link token for the person to accept the terms, and when it expires. */
  async termsLink(person: string): Promise<{ token: string; expires: string }> {
    return { token: await this.#link(person, TERMS), expires: iso(this.#now() + LINK_MS) };
  }

  /** Whether a one-time link to accept the terms is unused and unexpired. */
  async termsFor(token: string): Promise<boolean> {
    return this.#sql.all('SELECT 1 FROM links WHERE hash = ? AND vendor = ? AND expires_at > ?', await hash(token), TERMS, this.#now()).length > 0;
  }

  /** Records that the link's person accepted this version of the terms, and uses the link up. */
  async acceptTerms(token: string, version: string): Promise<boolean> {
    const tokenHash = await hash(token);
    const row = this.#sql.all('SELECT person FROM links WHERE hash = ? AND vendor = ? AND expires_at > ?', tokenHash, TERMS, this.#now())[0];
    if (!row) return false;
    this.#sql.all('INSERT OR IGNORE INTO terms (person, version, at) VALUES (?, ?, ?)', row.person as string, version, this.#now());
    this.#sql.all('DELETE FROM links WHERE hash = ?', tokenHash);
    return true;
  }

  async #eventKey(): Promise<string | undefined> {
    const row = this.#sql.all('SELECT sealed FROM connections WHERE vendor = ?', this.#deps.events.vendor)[0];
    return row ? this.#deps.vault.open(row.sealed as string) : undefined;
  }

  // The brand context (ADR-0023).

  async brandRead(): Promise<{ version: number; context: BrandContext; at: string | null }> {
    const current = this.#versions(1)[0];
    if (!current) return { version: 0, context: { sections: {}, offers: [] }, at: null };
    return { version: current.version, context: current.context, at: current.at };
  }

  async brandHistory(): Promise<BrandVersion[]> {
    return this.#versions();
  }

  #versions(limit = -1): BrandVersion[] {
    return this.#sql.all('SELECT * FROM brand ORDER BY version DESC LIMIT ?', limit).map((row) => ({
      version: row.version as number,
      context: JSON.parse(row.context as string) as BrandContext,
      approved_by: row.approved_by as string,
      at: iso(row.at as number),
      reason: row.reason as string,
      signals: JSON.parse(row.signals as string) as string[],
      restored_from: row.restored_from as number | null,
    }));
  }

  /**
   * Saves a change the person approved as a new version: new text for some sections, a new list of
   * offers, or an earlier version restored exactly. Refused unless it says it was approved, and unless
   * it was made from the current version, so two conversations cannot overwrite each other.
   */
  async brandChange(person: string, change: {
    approved: boolean; reason: string; base_version: number; signals?: string[];
    sections?: Partial<Record<Section, string>>; offers?: Offer[]; restore?: number;
  }): Promise<{ version: number }> {
    if (change.approved !== true) throw new Refusal('A brand context change is saved only after the person approves it; set approved once they have.');
    if (!change.reason?.trim()) throw new Refusal('Give the reason for the change.');
    const current = await this.brandRead();
    if (change.base_version !== current.version) {
      throw new Refusal(`The brand context is now version ${current.version}, not ${change.base_version}. Read it again and show the person the difference.`);
    }
    let context: BrandContext;
    let restoredFrom: number | null = null;
    if (change.restore !== undefined) {
      if (change.sections || change.offers) throw new Refusal('A restore takes no other change.');
      const earlier = this.#versions().find((v) => v.version === change.restore);
      if (!earlier) throw new Refusal(`There is no version ${change.restore}.`);
      context = earlier.context;
      restoredFrom = earlier.version;
    } else {
      if (!change.sections && !change.offers) throw new Refusal('Name the sections or the offers that change.');
      const sections = { ...current.context.sections };
      for (const [name, text] of Object.entries(change.sections ?? {})) {
        if (!(SECTIONS as readonly string[]).includes(name)) throw new Refusal(`There is no section ${name}; the sections are ${SECTIONS.join(', ')}.`);
        if (text.trim() === '') delete sections[name as Section];
        else sections[name as Section] = text;
      }
      context = { sections, offers: change.offers ? offers(change.offers) : current.context.offers };
    }
    const version = current.version + 1;
    this.#sql.all(
      'INSERT INTO brand (version, context, approved_by, at, reason, signals, restored_from) VALUES (?, ?, ?, ?, ?, ?, ?)',
      version, JSON.stringify(context), person, this.#now(), change.reason.trim(), JSON.stringify(change.signals ?? []), restoredFrom,
    );
    return { version };
  }

  // What is being sold (ADR-0032).

  /**
   * The offers in the brand context, and the events on the connected calendar: upcoming ones, and
   * past ones as far back as asked, which the skill reads the first time it sorts the calendar.
   */
  async offersList(options: { past_days?: number } = {}): Promise<{
    offers: Offer[]; upcoming: EventSummary[]; past: EventSummary[]; calendar: string | null;
  }> {
    const { context } = await this.brandRead();
    const key = await this.#eventKey();
    const calendar = this.#sql.all('SELECT name FROM connections WHERE vendor = ?', this.#deps.events.vendor)[0]?.name as string | undefined;
    if (!key) return { offers: context.offers, upcoming: [], past: [], calendar: null };
    const now = this.#now();
    const upcoming = await this.#deps.events.list(key, { after: iso(now), before: iso(now + AHEAD_DAYS * DAY) });
    const past = options.past_days
      ? await this.#deps.events.list(key, { after: iso(now - Math.min(options.past_days, 730) * DAY), before: iso(now) })
      : [];
    return { offers: context.offers, upcoming, past, calendar: calendar ?? null };
  }

  // Pieces and their signals (ADR-0025, ADR-0029, ADR-0031).

  async pieceSave(person: string, input: {
    id?: string; signal: (typeof SIGNALS)[number];
    week?: string; offer?: string; format?: string; kind?: string; audience?: string; destination?: string; platforms?: string[];
    brief?: string; reason?: string; note?: string;
    platform?: string; posted_at?: string; url?: string;
    numbers?: Record<string, number>; currency?: string;
  }): Promise<Piece> {
    const now = this.#now();
    let piece: Piece;
    if (input.signal === 'planned') {
      if (input.id) throw new Refusal('A piece is planned once; leave out its id.');
      const { context, version } = await this.brandRead();
      const offer = context.offers.find((o) => o.id === input.offer);
      if (!offer) throw new Refusal(`No offer ${input.offer ?? '(none given)'} is in the brand context; the offers are ${context.offers.map((o) => o.id).join(', ') || 'none yet'}.`);
      const destination = input.destination ?? offer.destination;
      if (!destination) throw new Refusal('Give the piece its destination: the event page or the page it sends people to.');
      const problem = destinationProblem(destination);
      if (problem) throw new Refusal(`The destination ${problem}.`);
      const id = this.#newId();
      piece = {
        id, week: week(input.week), offer: offer.id,
        format: oneOf(input.format, FORMATS, 'format'), kind: oneOf(input.kind, KINDS, 'kind'),
        audience: oneOf(input.audience ?? 'primary', AUDIENCES, 'audience'),
        destination, platforms: (input.platforms ?? ['instagram']).map((p) => oneOf(p, PLATFORMS, 'platform')),
        status: 'planned', brand_version: version || null, brief: null, approved: null, rejection: null,
        posts: [], reported: {}, results: null, links: {}, created_at: iso(now), updated_at: iso(now),
      };
    } else {
      piece = this.#piece(input.id);
      switch (input.signal) {
        case 'drafted':
        case 'edited':
          piece.brief = text(input.brief, 'brief');
          piece.brand_version = (await this.brandRead()).version || null;
          piece.status = 'drafted';
          piece.rejection = null;
          break;
        case 'shown':
          break;
        case 'approved':
          if (input.brief !== undefined) piece.brief = text(input.brief, 'brief');
          if (!piece.brief) throw new Refusal('Save the draft before approving it.');
          piece.approved = piece.brief;
          piece.status = 'approved';
          break;
        case 'rejected':
          piece.rejection = { reason: oneOf(input.reason, REJECTIONS, 'reason'), note: input.note?.trim() || null };
          piece.status = 'rejected';
          break;
        case 'posted': {
          if (piece.status !== 'approved' && piece.status !== 'posted') throw new Refusal('Only an approved piece is posted.');
          const platform = oneOf(input.platform ?? piece.platforms[0], PLATFORMS, 'platform');
          piece.posts.push({ platform, at: input.posted_at ? isoDate(input.posted_at) : iso(now), url: input.url ?? null });
          piece.status = 'posted';
          break;
        }
        case 'reported':
          for (const [name, value] of Object.entries(input.numbers ?? {})) {
            if (!(NUMBERS as readonly string[]).includes(name)) throw new Refusal(`${name} is not a number that can be reported; they are ${NUMBERS.join(', ')}.`);
            if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) throw new Refusal(`${name} must be a number of zero or more.`);
            piece.reported[name as (typeof NUMBERS)[number]] = value;
          }
          if (input.numbers?.revenue !== undefined) {
            if (!input.currency) throw new Refusal('Give the currency of the revenue reported, such as USD.');
            piece.reported.currency = input.currency.toUpperCase();
          }
          break;
        default:
          throw new Refusal(`signal must be one of ${SIGNALS.join(', ')}`);
      }
      piece.updated_at = iso(now);
    }
    piece.links = Object.fromEntries(piece.platforms.map((platform) => [platform, trackedLink(piece.destination, { platform, campaign: piece.offer, piece: piece.id })]));
    this.#sql.all('INSERT INTO pieces (id, record) VALUES (?, ?) ON CONFLICT (id) DO UPDATE SET record = excluded.record', piece.id, JSON.stringify(piece));
    const { id: _id, signal, ...data } = input;
    this.#sql.all('INSERT INTO signals (piece, at, kind, person, data) VALUES (?, ?, ?, ?, ?)', piece.id, now, signal, person, JSON.stringify(data));
    return piece;
  }

  #piece(id: string | undefined): Piece {
    const row = id ? this.#sql.all('SELECT record FROM pieces WHERE id = ?', id)[0] : undefined;
    if (!row) throw new Refusal(`There is no piece ${id ?? '(no id given)'}.`);
    return JSON.parse(row.record as string) as Piece;
  }

  async piecesList(filter: { week?: string; status?: string; format?: string; audience?: string; offer?: string; kind?: string } = {}): Promise<Piece[]> {
    return this.#sql.all('SELECT record FROM pieces').map((row) => JSON.parse(row.record as string) as Piece)
      .filter((p) => Object.entries(filter).every(([name, value]) => value === undefined || p[name as keyof typeof filter] === value))
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
  }

  async signals(piece: string): Promise<{ at: string; kind: string; person: string; data: Record<string, unknown> }[]> {
    return this.#sql.all('SELECT * FROM signals WHERE piece = ? ORDER BY at, rowid', piece).map((row) => ({
      at: iso(row.at as number), kind: row.kind as string, person: row.person as string, data: JSON.parse(row.data as string),
    }));
  }

  // Results (ADR-0025, ADR-0032).

  /**
   * Results for the pieces posted in a period: registrations, check-ins and revenue read from the
   * event platform for events starting from the period's first day to 90 days after its last, joined
   * to pieces by `utm_content`, beside the numbers the person reported. Grouped by format, audience,
   * kind and offer, with each group's count of pieces for the review's rule of evidence.
   */
  async resultsRead(period: { from: string; to: string }) {
    const from = Date.parse(isoDate(period.from));
    const to = Date.parse(isoDate(period.to)) + DAY;
    if (!(from < to)) throw new Refusal('from must be on or before to.');
    const pieces = (await this.piecesList()).filter((p) => p.posts.some((post) => {
      const at = Date.parse(post.at);
      return at >= from && at < to;
    }));
    const key = await this.#eventKey();
    const counted = new Map<string, { registrations: number; check_ins: number; revenue: number; currency: string | null }>();
    const unattributed = { registrations: 0, check_ins: 0, revenue: null as Money | null };
    const read: { event: string; name: string; start: string }[] = [];
    if (key) {
      const events = await this.#deps.events.list(key, { after: iso(from), before: iso(to + 90 * DAY) });
      for (const event of events) {
        const found: Tally = await this.#deps.events.tally(key, event.id);
        read.push({ event: event.id, name: event.name, start: event.start });
        for (const [content, count] of Object.entries(found.byContent)) {
          const into = counted.get(content) ?? { registrations: 0, check_ins: 0, revenue: 0, currency: found.currency };
          into.registrations += count.registrations;
          into.check_ins += count.checkIns;
          into.revenue += count.revenue;
          counted.set(content, into);
        }
        unattributed.registrations += found.unattributed.registrations;
        unattributed.check_ins += found.unattributed.checkIns;
        if (found.currency && found.unattributed.revenue) {
          unattributed.revenue = { amount: (unattributed.revenue?.amount ?? 0) + major(found.unattributed.revenue, found.currency), currency: found.currency.toUpperCase() };
        }
      }
      const known = new Set((await this.piecesList()).map((p) => p.id));
      for (const [content, count] of counted) {
        if (known.has(content)) continue;
        unattributed.registrations += count.registrations;
        unattributed.check_ins += count.check_ins;
      }
      for (const piece of pieces) {
        const count = counted.get(piece.id);
        piece.results = {
          registrations: count?.registrations ?? 0, check_ins: count?.check_ins ?? 0,
          revenue: count?.currency ? { amount: major(count.revenue, count.currency), currency: count.currency.toUpperCase() } : null,
          read_at: iso(this.#now()),
        };
        this.#sql.all('UPDATE pieces SET record = ? WHERE id = ?', JSON.stringify(piece), piece.id);
      }
    }
    const rows = pieces.map((p) => ({
      id: p.id, week: p.week, offer: p.offer, format: p.format, kind: p.kind, audience: p.audience,
      posted: p.posts.map((post) => post.at), events: p.results, reported: p.reported,
    }));
    return {
      period: { from: isoDate(period.from), to: isoDate(period.to) },
      event_platform: key ? 'read' : 'not connected',
      events_read: read,
      pieces: rows,
      by_format: group(rows, 'format'),
      by_audience: group(rows, 'audience'),
      by_kind: group(rows, 'kind'),
      by_offer: group(rows, 'offer'),
      unattributed,
    };
  }

  // Export and closing (ADR-0030).

  async exportAll(): Promise<{ json: string; markdown: string }> {
    const { version, context } = await this.brandRead();
    const pieces = await this.piecesList();
    const record = {
      users: this.#sql.all('SELECT person, added_at FROM users').map((r) => ({ person: r.person, added: iso(r.added_at as number) })),
      connections: this.#sql.all('SELECT vendor, identifier, name, connected_at FROM connections')
        .map((r) => ({ vendor: r.vendor, calendar: r.identifier, name: r.name, connected: iso(r.connected_at as number) })),
      brand: await this.brandHistory(),
      terms: this.#sql.all('SELECT person, version, at FROM terms').map((r) => ({ person: r.person, version: r.version, accepted: iso(r.at as number) })),
      pieces: await Promise.all(pieces.map(async (p) => ({ ...p, signals: await this.signals(p.id) }))),
    };
    const lines = [`# Brand context, version ${version}`, ''];
    for (const section of SECTIONS) {
      if (context.sections[section]) lines.push(`## ${section}`, '', context.sections[section]!, '');
    }
    lines.push('## offers', '', ...context.offers.map((o) => `- **${o.name}** (\`${o.id}\`, ${o.pattern})${o.destination ? `: ${o.destination}` : ''}`), '');
    lines.push('# History', '', ...record.brand.map((v) => `- Version ${v.version}, ${v.at}, by ${v.approved_by}: ${v.reason}`), '');
    lines.push('# Pieces', '', ...pieces.map((p) => `- ${p.id}: ${p.week}, ${p.offer}, ${p.format} ${p.kind}, ${p.status}`), '');
    return { json: JSON.stringify(record, null, 2), markdown: lines.join('\n') };
  }

  /** Deletes everything the customer's object holds. */
  async erase(): Promise<void> {
    for (const table of TABLES) this.#sql.all(`DELETE FROM ${table}`);
  }
}

function offers(list: Offer[]): Offer[] {
  const seen = new Set<string>();
  return list.map((offer) => {
    if (!/^[a-z0-9][a-z0-9-]{0,62}$/.test(offer.id ?? '')) throw new Refusal(`Offer id ${offer.id} must be lower-case letters, digits and hyphens; it is the campaign on every tracked link.`);
    if (seen.has(offer.id)) throw new Refusal(`Offer id ${offer.id} appears twice.`);
    seen.add(offer.id);
    if (!offer.name?.trim()) throw new Refusal(`Offer ${offer.id} needs a name.`);
    if (offer.destination) {
      const problem = destinationProblem(offer.destination);
      if (problem) throw new Refusal(`Offer ${offer.id}'s destination ${problem}.`);
    }
    return {
      id: offer.id, name: offer.name.trim(), pattern: oneOf(offer.pattern, PATTERNS, 'pattern'),
      ...(offer.destination ? { destination: offer.destination } : {}),
      ...(offer.aliases?.length ? { aliases: offer.aliases } : {}),
      ...(offer.promote === false ? { promote: false } : {}),
      ...(offer.notes ? { notes: offer.notes } : {}),
    };
  });
}

function group(rows: { [key: string]: unknown; events: Piece['results']; reported: Piece['reported'] }[], by: 'format' | 'audience' | 'kind' | 'offer') {
  const groups: Record<string, { pieces: number; registrations: number; check_ins: number; views: number; reported_conversions: number }> = {};
  for (const row of rows) {
    const into = (groups[row[by] as string] ??= { pieces: 0, registrations: 0, check_ins: 0, views: 0, reported_conversions: 0 });
    into.pieces += 1;
    into.registrations += row.events?.registrations ?? 0;
    into.check_ins += row.events?.check_ins ?? 0;
    into.views += row.reported.views ?? 0;
    into.reported_conversions += row.reported.conversions ?? 0;
  }
  return groups;
}

function oneOf<T extends string>(value: string | undefined, allowed: readonly T[], name: string): T {
  if (!allowed.includes(value as T)) throw new Refusal(`${name} must be one of ${allowed.join(', ')}`);
  return value as T;
}

function text(value: string | undefined, name: string): string {
  if (typeof value !== 'string' || value.trim() === '') throw new Refusal(`Give the ${name}.`);
  return value;
}

/** An ISO week such as 2026-W46. */
function week(value: string | undefined): string {
  if (!/^\d{4}-W\d{2}$/.test(value ?? '')) throw new Refusal('week must be an ISO week, such as 2026-W46.');
  return value!;
}

function isoDate(value: string): string {
  const at = Date.parse(value);
  if (Number.isNaN(at)) throw new Refusal(`${value} is not a date.`);
  return new Date(at).toISOString().slice(0, value.length <= 10 ? 10 : 24);
}

function iso(at: number): string {
  return new Date(at).toISOString();
}

/** Minor units to the currency's main unit, by the number of decimals the currency has. */
function major(minor: number, currency: string): number {
  let digits = 2;
  try {
    digits = new Intl.NumberFormat('en', { style: 'currency', currency: currency.toUpperCase() }).resolvedOptions().maximumFractionDigits ?? 2;
  } catch {
    // A currency Intl does not know keeps two decimals.
  }
  return minor / 10 ** digits;
}
