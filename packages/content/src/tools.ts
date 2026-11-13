// The content server's tools (ADR-0029). Each does something Claude's own features cannot do
// reliably: keep the brand context and its versions, keep pieces and their signals across
// conversations, build tracked links, and read events and registrations with a key that never
// passes through the conversation. No tool's input takes a credential.

import {
  AUDIENCES, FORMATS, KINDS, NUMBERS, PATTERNS, REJECTIONS, Refusal, SECTIONS, SIGNALS, type Customer,
} from './customer.ts';
import { PLATFORMS } from './links.ts';

/** The calls a tool makes on its customer's records, whether held here or in a Durable Object. */
export type CustomerCalls = {
  [K in 'status' | 'brandRead' | 'brandHistory' | 'brandChange' | 'offersList' | 'pieceSave' | 'piecesList' | 'resultsRead' | 'waitlistList' | 'waitlistActivate' | 'waitlistDecline' | 'funnelRead' | 'isUser' | 'access' | 'billing']: Customer[K];
};

export interface Context {
  person: string;
  /** The customer's own address, such as https://content.example/customers/acme. */
  base: string;
  customer: CustomerCalls;
}

export interface Tool {
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations: { title: string; readOnlyHint: boolean; destructiveHint: boolean; idempotentHint?: boolean; openWorldHint: boolean };
  /** The card Claude shows with the tool's result, when the server has it built (ADR-0049). */
  card?: 'waitlist';
  call(args: Record<string, any>, context: Context): Promise<unknown>;
}

const string = (description: string) => ({ type: 'string', description });
const choice = (values: readonly string[], description: string) => ({ type: 'string', enum: [...values], description });
const object = (properties: Record<string, unknown>, required: string[] = []) => ({
  type: 'object', properties, ...(required.length ? { required } : {}), additionalProperties: false,
});

const offer = object({
  id: string('Lower-case letters, digits and hyphens. It is the campaign on every tracked link, so keep it once chosen.'),
  name: string('What the brand calls it.'),
  pattern: choice(PATTERNS, 'launch: one-off or annual; series: recurs on a rhythm; event: a single distinct event; format: offered again and again on an open schedule; product: sold, not scheduled.'),
  destination: string('The page a piece sends people to when no single event page does, such as a product page or a format\'s calendar page.'),
  aliases: { type: 'array', items: { type: 'string' }, description: 'Event titles, past and present, that belong to it, so a new title can be told apart from a known one.' },
  promote: { type: 'boolean', description: 'False for something the person asked never to promote.' },
  notes: string('Anything else the plan needs, such as the rhythm or the usual host and venue.'),
}, ['id', 'name', 'pattern']);

/** A change to one person on the waitlist answers the whole list, so a card showing it redraws. */
async function changed(customer: CustomerCalls, email: unknown, change: (email: string) => Promise<{ found: boolean }>) {
  if (typeof email !== 'string' || !email.trim()) throw new Refusal('Give the person\'s address, as waitlist_list lists it.');
  if (!(await change(email)).found) throw new Refusal('That address is not on the waitlist.');
  return { people: await customer.waitlistList() };
}

const readOnly = (title: string) => ({ title, readOnlyHint: true, destructiveHint: false, openWorldHint: false });

export const TOOLS: Tool[] = [
  {
    name: 'account_status',
    title: 'Account status',
    description: 'What this customer has connected and what is missing, with a one-time link for each missing '
      + 'connection. Give the person the link to open in a browser; they enter any key there, never in the '
      + 'conversation. A link works once and expires within minutes. A connection marked optional, such as the '
      + 'event platform, is needed only by a brand that sells events. When the beta terms are missing, no other '
      + 'tool works until the person opens their link and accepts them there.',
    inputSchema: object({}),
    annotations: readOnly('Account status'),
    call: (_args, { customer, person, base }) => customer.status(person, base),
  },
  {
    name: 'brand_read',
    title: 'Read the brand context',
    description: 'The current brand context and its version: positioning, audiences, values and lines, voice, '
      + 'approved and rejected examples, AI tells to avoid, and the offers (promotable things). Read it at the '
      + 'start of every task, before writing anything.',
    inputSchema: object({}),
    annotations: readOnly('Read the brand context'),
    call: (_args, { customer }) => customer.brandRead(),
  },
  {
    name: 'brand_change',
    title: 'Save a brand context change',
    description: 'Saves a change to the brand context as a new version, with its reason and the signals behind it. '
      + 'Call it only after showing the person the difference and their approving it. A section given as an '
      + 'empty string is cleared; offers, when given, replace the whole list. Or restore an earlier version, '
      + 'which saves it again as a new one.',
    inputSchema: object({
      approved: { type: 'boolean', description: 'True only once the person has approved this change.' },
      base_version: { type: 'integer', minimum: 0, description: 'The version the change was made from, as brand_read gave it; 0 for the first.' },
      reason: string('Why, in a sentence the person would recognise.'),
      signals: { type: 'array', items: { type: 'string' }, description: 'Ids of the pieces, and short notes of the edits or results, that support the change.' },
      sections: object(Object.fromEntries(SECTIONS.map((s) => [s, string(`The new text of ${s}, in Markdown.`)]))),
      offers: { type: 'array', items: offer, description: 'The whole new list of offers.' },
      restore: { type: 'integer', minimum: 1, description: 'An earlier version to restore, with no other change.' },
    }, ['approved', 'base_version', 'reason']),
    annotations: { title: 'Save a brand context change', readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    call: (args, { customer, person }) => customer.brandChange(person, args as Parameters<Customer['brandChange']>[1]),
  },
  {
    name: 'brand_history',
    title: 'Brand context history',
    description: 'Every version of the brand context, newest first, with who approved it, when, why and its signals.',
    inputSchema: object({}),
    annotations: readOnly('Brand context history'),
    call: (_args, { customer }) => customer.brandHistory(),
  },
  {
    name: 'offers_list',
    title: 'List what is being sold',
    description: 'The offers in the brand context, and the events on the connected event calendar for the next '
      + '120 days: name, page, start, venue, and capacity and places remaining where the platform states them. '
      + 'Ask for past events too when sorting the calendar into promotable things for the first time.',
    inputSchema: object({
      past_days: { type: 'integer', minimum: 1, maximum: 730, description: 'Also list events from this many days back.' },
    }),
    annotations: { ...readOnly('List what is being sold'), openWorldHint: true },
    call: (args, { customer }) => customer.offersList({ past_days: args.past_days }),
  },
  {
    name: 'piece_save',
    title: 'Save a piece',
    description: 'Records a piece as it is planned, drafted, shown, edited, approved, rejected or posted, or the '
      + 'numbers the person reports for it, and returns it with its tracked link for each platform. Plan it '
      + 'first (signal planned, no id) with its week, offer, format, kind, audience and destination; every '
      + 'later signal names its id. Save the whole brief on drafted, edited and approved, so every edit is kept.',
    inputSchema: object({
      id: string('The piece, for every signal but planned.'),
      signal: choice(SIGNALS, 'What happened.'),
      week: string('planned: the ISO week it is for, such as 2026-W46.'),
      offer: string('planned: the id of the offer it promotes.'),
      format: choice(FORMATS, 'planned.'),
      kind: choice(KINDS, 'planned.'),
      audience: choice(AUDIENCES, 'planned: primary unless it is for the secondary audience.'),
      destination: string('planned: the event page or other page it sends people to; the offer\'s destination when absent.'),
      platforms: { type: 'array', items: { type: 'string', enum: [...PLATFORMS] }, description: 'planned: where it will be posted; instagram when absent.' },
      brief: string('drafted, edited or approved: the whole Reel brief, in Markdown.'),
      reason: choice(REJECTIONS, 'rejected.'),
      note: string('rejected: the person\'s words.'),
      platform: { type: 'string', enum: [...PLATFORMS], description: 'posted.' },
      posted_at: string('posted: when, as an ISO date or time; now when absent.'),
      url: string('posted: the post\'s own address, if the person gives it.'),
      numbers: object(Object.fromEntries(NUMBERS.map((n) => [n, { type: 'number', minimum: 0 }]))),
      currency: string('reported: the currency of reported revenue, such as USD.'),
    }, ['signal']),
    annotations: { title: 'Save a piece', readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    call: (args, { customer, person }) => customer.pieceSave(person, args as Parameters<Customer['pieceSave']>[1]),
  },
  {
    name: 'pieces_list',
    title: 'List pieces',
    description: 'Pieces by week, status, format, kind, audience or offer, oldest first.',
    inputSchema: object({
      week: string('An ISO week, such as 2026-W46.'),
      status: choice(['planned', 'drafted', 'approved', 'rejected', 'posted'], ''),
      format: choice(FORMATS, ''),
      kind: choice(KINDS, ''),
      audience: choice(AUDIENCES, ''),
      offer: string('An offer\'s id.'),
    }),
    annotations: readOnly('List pieces'),
    call: (args, { customer }) => customer.piecesList(args),
  },
  {
    name: 'results_read',
    title: 'Read results',
    description: 'Results for the pieces posted in a period: registrations, check-ins and revenue read from the '
      + 'event platform per piece, beside the numbers the person reported, and totals by format, audience, kind '
      + 'and offer with each group\'s count of pieces. Never a guest\'s name or address.',
    inputSchema: object({
      from: string('The first day, as YYYY-MM-DD.'),
      to: string('The last day, as YYYY-MM-DD.'),
    }, ['from', 'to']),
    annotations: { ...readOnly('Read results'), openWorldHint: true },
    call: (args, { customer }) => customer.resultsRead({ from: args.from, to: args.to }),
  },
  {
    name: 'funnel_read',
    title: 'Read the funnel',
    description: 'The brand\'s waitlist funnel over a period, for each page and source: visits to the pages that carry the '
      + 'waitlist form (counted once a browser session, with no visitor identity), then how many joined, proved their '
      + 'Instagram handle and were activated, with joined divided by visits. A source is the page\'s tracking tags '
      + '(utm_*), empty for visits that carried none. counting_since is the first day visits were counted; joins before '
      + 'it have no visits to compare with. Use it to find the weakest stage and the source that converts worst.',
    inputSchema: object({
      from: string('The first day, as YYYY-MM-DD.'),
      to: string('The last day, as YYYY-MM-DD.'),
    }, ['from', 'to']),
    annotations: readOnly('Read the funnel'),
    call: (args, { customer }) => customer.funnelRead({ from: args.from, to: args.to }),
  },
  {
    name: 'waitlist_list',
    title: 'List the waitlist',
    description: 'The brand\'s waitlist in the order its account page ranks it: referrals plus Reels commented on, '
      + 'then who joined first. Each person has their address, when they joined, their referrals, the Instagram '
      + 'handle they proved, how many Reels it commented on, the tracking tags of the page they joined on, and '
      + 'when they were activated or declined. Where Claude shows cards, the person sees the list as a card, '
      + 'where they sort and filter it and activate or decline people themselves.',
    inputSchema: object({}),
    annotations: readOnly('List the waitlist'),
    card: 'waitlist',
    call: async (_args, { customer }) => ({ people: await customer.waitlistList() }),
  },
  {
    name: 'waitlist_activate',
    title: 'Activate someone on the waitlist',
    description: 'Activates one person on the brand\'s waitlist, by the address it lists, and answers the waitlist '
      + 'as it now stands. Call it only when the person you work for names who to activate. Activating gives them '
      + 'access to what the brand sells; CMOkit sends them no email yet, so the person tells them. A declined '
      + 'person is restored with waitlist_decline first.',
    inputSchema: object({ email: string('Their address, as waitlist_list gives it.') }, ['email']),
    annotations: { title: 'Activate someone', readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    card: 'waitlist',
    call: (args, { customer }) => changed(customer, args.email, (email) => customer.waitlistActivate(email)),
  },
  {
    name: 'waitlist_decline',
    title: 'Decline someone on the waitlist',
    description: 'Declines one person on the brand\'s waitlist, by the address it lists, or with restore true '
      + 'puts a declined person back, and answers the waitlist as it now stands. Call it only when the person you '
      + 'work for names who to decline. Declining sends nothing and deletes nothing: the card hides declined '
      + 'people unless its Declined filter is on. An activated person cannot be declined.',
    inputSchema: object({
      email: string('Their address, as waitlist_list gives it.'),
      restore: { type: 'boolean', description: 'True to put a declined person back on the waiting list.' },
    }, ['email']),
    annotations: { title: 'Decline someone', readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    card: 'waitlist',
    call: (args, { customer }) => changed(customer, args.email, (email) => customer.waitlistDecline(email, args.restore !== true)),
  },
];

export const INSTRUCTIONS = `CMOkit keeps this brand's context, its pieces and their results. Read the brand context with
brand_read before writing anything, and write from it. Change it only with brand_change, after showing
the person the difference and their approving it. Never accept a credential in the conversation: if the
person starts to paste a key or password, stop them and give them the link account_status returns
instead. If the content skill is not loaded, ask the person to turn on the cmokit-content plugin's
skill in Claude's settings.`.replace(/\n/g, ' ');
