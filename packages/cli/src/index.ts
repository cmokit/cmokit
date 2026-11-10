// A site's CMOkit configuration, which is deployed with the edge and the lifecycle (ADR-0009) and
// declares each experiment's plan and status (ADR-0013), each sequence of messages to leads, and the
// site's waitlist (ADR-0014).

/**
 * `draft`: the edge serves the control to everyone. `running`: the edge assigns visitors and records
 * exposures. `ended`: the edge serves the control to everyone again.
 */
export type Status = 'draft' | 'running' | 'ended';

export const STATUSES: readonly Status[] = ['draft', 'running', 'ended'];

export interface Experiment {
  /** The experiments tool's flag. Lowercase letters, digits, `-` and `_`. */
  flag: string;
  /** The page under experiment, which is also its control variant. */
  path: string;
  /** Each variant other than the control, as the path of the page that holds it. */
  variants: Record<string, string>;
  /** The conversion event the experiment is decided on, as a page's `data-cmokit-convert` names it. */
  goal: string;
  /**
   * The percentage of visitors each variant gets, `control` included, summing to 100. Defaults to an
   * even split.
   */
  split?: Record<string, number>;
  status: Status;
}

/** One message of a sequence. */
export interface Message {
  /** The template, as `messages/<template>.md` in the site's repository. */
  template: string;
  /** How long after the one before it is sent, or after the lead is captured for the first: `0m`, `12h`, `3d`. */
  after: string;
}

/** Messages sent to a lead in order, until one of its stopping events or an unsubscribe. */
export interface Sequence {
  /** Lowercase letters, digits, `-` and `_`. */
  name: string;
  /** The conversion event that captures a lead into it, from a form that carries an email address. */
  start: string;
  /** Conversion events that end it, such as starting a trial. */
  stop?: string[];
  messages: Message[];
}

export interface Config {
  analytics: {
    posthog: {
      /** The project key. Public by design. */
      key: string;
      /** Where events and flags are sent. Defaults to PostHog's US cloud. */
      host?: string;
      /** The project's id (Project settings → Project ID), which `cmokit experiments sync` needs. */
      project?: number;
    };
    /**
     * Query parameters a visit records besides its campaign parameters, such as a partner's code
     * (MSR-08). Any other parameter still reaches the page, but is never sent to analytics.
     */
    params?: string[];
  };
  experiments?: Experiment[];
  /** How messages are sent. Needed when there are sequences. */
  messaging?: {
    /** The address messages are sent from, on a domain authenticated in the sending service. */
    from: string;
    /** The name messages are sent from. */
    fromName?: string;
    /** The postal address every message carries, as anti-spam law requires. */
    address: string;
    sendgrid: {
      /** The unsubscribe group (Suppressions → Unsubscribe Groups) every message belongs to. */
      unsubscribeGroup: number;
    };
  };
  sequences?: Sequence[];
  /**
   * A waitlist (ADR-0014): a form's conversion event puts its address on the list, and a maintainer
   * activates people from it with `cmokit waitlist activate`, which sends each the activation message.
   * Each person gets a referral link, and the list ranks people by how many joined through theirs.
   */
  waitlist?: {
    /** The conversion event, from a form that carries an email address, that joins the list. */
    event: string;
    /** The query parameter that carries a referral code. Defaults to `ref`. */
    referral?: string;
    /** The message sent at activation, as `messages/<template>.md`, whose `{{link}}` is `link`. */
    template: string;
    /** Where an activated person goes next, such as the product's sign-up page. */
    link: string;
  };
  /**
   * A subscription the product sells (ADR-0017): its plan's price in the payment processor and its
   * free trial. The product's Worker gives and revokes access as each subscription changes.
   */
  subscription?: {
    /** Days of free trial before the first charge. */
    trialDays: number;
    stripe: {
      /** The plan's recurring price id, such as price_1Abc. */
      price: string;
    };
  };
}

/** A configuration with its defaults filled in and its paths normalized, as the edge uses it. */
export interface Resolved {
  analytics: {
    posthog: {
      key: string;
      host: string;
      /** PostHog's app and API host for `host`: us.i.posthog.com is reached at us.posthog.com. */
      app: string;
      project?: number;
    };
    /** Every query parameter a visit records: the campaign parameters, the site's own and the referral one. */
    params: string[];
  };
  experiments: (Experiment & { split: Record<string, number> })[];
  /** How messages are sent, named for the job: the sending service's own settings are its adapter's. */
  messaging?: { from: string; fromName: string; address: string; unsubscribeGroup: number };
  sequences: (Required<Omit<Sequence, 'messages'>> & { messages: (Message & { afterMs: number })[] })[];
  /** The subscription the product sells, named for the job: the price id is the payments adapter's. */
  subscription?: { trialDays: number; price: string };
  waitlist?: { event: string; referral: string; template: string; link: string };
}

export const CONVERT_PATH = '/_cmokit/convert';
export const RELAY_PATH = '/_cmokit/a';
export const CONTROL = 'control';
export const VISITOR_COOKIE = 'cmokit_id';
export const PREVIEW_PARAM = 'cmokit_variant';
export const variantCookie = (flag: string) => `cmokit_x_${flag}`;
/** Where the edge passes requests to the lifecycle: unsubscribing, and the sending service's events. */
export const LEADS_PATH = '/_cmokit/leads';
/** The lifecycle's routes for a captured lead and a lead's later conversion, which only the edge reaches. */
export const LIFECYCLE_LEAD = '/internal/lead';
export const LIFECYCLE_EVENT = '/internal/event';
/** Where the edge passes the payment processor's events to the lifecycle. */
export const SUBSCRIPTIONS_PATH = '/_cmokit/subscriptions';
/** The lifecycle's routes for a product's checkout and portal links, which only the product's Worker reaches. */
export const LIFECYCLE_CHECKOUT = '/internal/checkout';
export const LIFECYCLE_PORTAL = '/internal/portal';
/** The cookie that remembers a visitor's lead, so a later conversion can end its sequence. */
export const LEAD_COOKIE = 'cmokit_lead';
/** The cookie that keeps the parameters of a visitor's first arrival that carried any (MSR-08). */
export const FIRST_COOKIE = 'cmokit_from';
/** Where the edge passes a maintainer's waitlist requests to the lifecycle, which checks their key. */
export const WAITLIST_PATH = '/_cmokit/waitlist';
/** The lifecycle's route that answers whether an address is activated, which only a product's Worker reaches. */
export const LIFECYCLE_ACTIVATED = '/internal/activated';
/**
 * The lifecycle's routes that list its waitlist and activate a person on it for a product's account
 * page, which only a product's Worker reaches, so they carry no waitlist key (ADR-0042).
 */
export const LIFECYCLE_WAITLIST = '/internal/waitlist';
export const LIFECYCLE_ACTIVATE = '/internal/activate';
/**
 * The query parameters that name a visit's channel: UTM parameters and ad platforms' click ids. A
 * visit records those it was requested with, so the channel reaches analytics even when the browser's
 * script is blocked.
 */
export const CAMPAIGN_PARAMS: readonly string[] = [
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_name', 'utm_term',
  'gclid', 'gad_source', 'gclsrc', 'dclid', 'gbraid', 'wbraid', 'fbclid', 'msclkid', 'twclid',
  'li_fat_id', 'mc_cid', 'igshid', 'ttclid', 'rdt_cid', 'irclid', '_kx', 'epik', 'qclid', 'sccid',
  'oppref', 'bfcid',
];
/** A query parameter's name, as a site's configuration may add one to those recorded. */
export const PARAM = /^[A-Za-z0-9_-]{1,64}$/;

/** A URL with its query string and fragment taken off, as analytics receives it (MSR-08). */
export function bareUrl(url: string): string {
  if (!URL.canParse(url)) return url;
  const parsed = new URL(url);
  return `${parsed.origin}${parsed.pathname}`;
}

/**
 * A person's referral code on a waitlist: a hash of their lead key, so the edge and the lifecycle
 * agree on it without asking each other.
 */
export async function referralCode(key: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`referral:${key}`));
  return [...new Uint8Array(digest)].slice(0, 5).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** A form field carrying a lead's email address. */
export const EMAIL = /^[^\s@<>()",;:]{1,64}@[a-z0-9.-]{1,190}\.[a-z]{2,24}$/i;

/** A lead's key: a hash of its address, so a lead is found again without the address in a cookie. */
export async function leadKey(email: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(email.trim().toLowerCase()));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const DELAY = /^(\d{1,4})([mhd])$/;
const UNIT_MS = { m: 60_000, h: 3_600_000, d: 86_400_000 } as const;

/** A delay such as `3d` in milliseconds, or undefined when it is not one. */
export function delayMs(delay: string): number | undefined {
  const m = DELAY.exec(delay);
  return m ? Number(m[1]) * UNIT_MS[m[2] as keyof typeof UNIT_MS] : undefined;
}

const DEFAULT_HOST = 'https://us.i.posthog.com';
const FLAG = /^[a-z0-9][a-z0-9_-]{0,63}$/;
/** A conversion event's name. */
export const EVENT_NAME = /^[a-z0-9_]{1,64}$/;

/** A page path as the edge compares it: no trailing slash, no `index.html`. */
export function normalizePath(path: string): string {
  const trimmed = path.replace(/\/index\.html$/, '/').replace(/\/+$/, '');
  return trimmed === '' ? '/' : trimmed;
}

/** Returns every problem with a configuration; empty when it is valid. */
export function problems(config: Config): string[] {
  const found: string[] = [];
  if (!config.analytics?.posthog?.key) found.push('analytics.posthog.key is missing');
  const project = config.analytics?.posthog?.project;
  if (project !== undefined && !(Number.isInteger(project) && project > 0)) {
    found.push('analytics.posthog.project must be the project\'s numeric id');
  }
  const flags = new Set<string>();
  const paths = new Set<string>();
  for (const experiment of config.experiments ?? []) {
    const where = `experiment "${experiment.flag}"`;
    if (!FLAG.test(experiment.flag)) found.push(`${where}: flag must match ${FLAG}`);
    if (flags.has(experiment.flag)) found.push(`${where}: flag is used twice`);
    flags.add(experiment.flag);
    if (!experiment.path.startsWith('/')) found.push(`${where}: path must start with /`);
    const path = normalizePath(experiment.path);
    if (paths.has(path)) found.push(`${where}: ${path} is under another experiment`);
    paths.add(path);
    if (!EVENT_NAME.test(experiment.goal ?? '')) found.push(`${where}: goal must be an event name matching ${EVENT_NAME}`);
    if (!STATUSES.includes(experiment.status)) found.push(`${where}: status must be one of ${STATUSES.join(', ')}`);
    if (experiment.split) {
      const keys = [CONTROL, ...Object.keys(experiment.variants ?? {})];
      const shares = Object.entries(experiment.split);
      const total = shares.reduce((sum, [, share]) => sum + share, 0);
      if (keys.some((k) => !(k in experiment.split!)) || shares.some(([k]) => !keys.includes(k))) {
        found.push(`${where}: split must name exactly ${keys.join(', ')}`);
      } else if (shares.some(([, share]) => !Number.isInteger(share) || share < 0) || total !== 100) {
        found.push(`${where}: split must be whole percentages summing to 100`);
      }
    }
    const variants = Object.entries(experiment.variants ?? {});
    if (variants.length === 0) found.push(`${where}: needs at least one variant besides the control`);
    for (const [name, page] of variants) {
      if (name === CONTROL) found.push(`${where}: "${CONTROL}" is the page itself, not a variant`);
      if (!page.startsWith('/')) found.push(`${where}: variant "${name}" must be a path starting with /`);
      if (normalizePath(page) === path) found.push(`${where}: variant "${name}" is the page under experiment`);
    }
  }
  for (const param of config.analytics?.params ?? []) {
    if (!PARAM.test(param)) found.push(`analytics.params: "${param}" must match ${PARAM}`);
  }
  found.push(...sequenceProblems(config));
  const w = config.waitlist;
  if (w) {
    if (!EVENT_NAME.test(w.event ?? '')) found.push(`waitlist.event must be an event name matching ${EVENT_NAME}`);
    if (w.referral !== undefined && !PARAM.test(w.referral)) found.push(`waitlist.referral must match ${PARAM}`);
    if (!TEMPLATE.test(w.template ?? '')) found.push(`waitlist.template must match ${TEMPLATE}`);
    if (!/^https:\/\//.test(w.link ?? '') || !URL.canParse(w.link)) found.push('waitlist.link must be an https address');
    if (!config.messaging) found.push('messaging is needed to send the waitlist\'s activation message');
  }
  const s = config.subscription;
  if (s) {
    if (!(Number.isInteger(s.trialDays) && s.trialDays >= 0 && s.trialDays <= 730)) found.push('subscription.trialDays must be a whole number of days from 0 to 730');
    if (!/^price_[A-Za-z0-9]+$/.test(s.stripe?.price ?? '')) found.push('subscription.stripe.price must be a price id, such as price_1Abc');
  }
  return found;
}

function sequenceProblems(config: Config): string[] {
  const found: string[] = [];
  const sequences = config.sequences ?? [];
  const m = config.messaging;
  if (sequences.length > 0 && !m) found.push('messaging is needed to send sequences');
  if (m) {
    if (!EMAIL.test(m.from ?? '')) found.push('messaging.from must be an email address');
    if (!m.address?.trim()) found.push('messaging.address must be the postal address messages carry');
    const group = m.sendgrid?.unsubscribeGroup;
    if (!(Number.isInteger(group) && group > 0)) found.push('messaging.sendgrid.unsubscribeGroup must be the group\'s numeric id');
  }
  const names = new Set<string>();
  const starts = new Set<string>();
  for (const sequence of sequences) {
    const where = `sequence "${sequence.name}"`;
    if (!FLAG.test(sequence.name ?? '')) found.push(`${where}: name must match ${FLAG}`);
    if (sequence.name === 'waitlist') found.push(`${where}: "waitlist" is the waitlist's own name`);
    if (names.has(sequence.name)) found.push(`${where}: name is used twice`);
    names.add(sequence.name);
    if (!EVENT_NAME.test(sequence.start ?? '')) found.push(`${where}: start must be an event name matching ${EVENT_NAME}`);
    if (starts.has(sequence.start)) found.push(`${where}: another sequence also starts on ${sequence.start}`);
    starts.add(sequence.start);
    for (const stop of sequence.stop ?? []) {
      if (!EVENT_NAME.test(stop)) found.push(`${where}: stop "${stop}" must be an event name matching ${EVENT_NAME}`);
      if (stop === sequence.start) found.push(`${where}: ${stop} cannot both start and stop it`);
    }
    if (!sequence.messages?.length) found.push(`${where}: needs at least one message`);
    for (const [i, message] of (sequence.messages ?? []).entries()) {
      if (!TEMPLATE.test(message.template ?? '')) found.push(`${where}: message ${i + 1}'s template must match ${TEMPLATE}`);
      if (delayMs(message.after ?? '') === undefined) found.push(`${where}: message ${i + 1}'s after must be like 0m, 12h or 3d`);
    }
  }
  return found;
}

/** A message template's name, as `messages/<name>.md`. */
export const TEMPLATE = /^[a-z0-9][a-z0-9-]{0,63}$/;

/** A message template: markdown with a `subject` in its front matter. Returns its parts, or a problem. */
export function parseTemplate(template: string): { subject: string; body: string } | { problem: string } {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(template);
  if (!m) return { problem: 'needs front matter between --- lines, with a subject' };
  const subject = /^subject:\s*(.+)$/m.exec(m[1])?.[1].trim().replace(/^(['"])(.*)\1$/, '$2');
  if (!subject) return { problem: 'needs a subject in its front matter' };
  return { subject, body: m[2].trim() };
}

/** Checks a configuration and returns it, so `cmokit.config.ts` fails as soon as it is loaded. */
export function defineConfig(config: Config): Config {
  const found = problems(config);
  if (found.length > 0) throw new Error(`CMOkit configuration:\n  ${found.join('\n  ')}`);
  return config;
}

export function resolve(config: Config): Resolved {
  const { key, project } = config.analytics.posthog;
  const host = config.analytics.posthog.host ?? DEFAULT_HOST;
  const m = config.messaging;
  return {
    analytics: {
      posthog: { key, host, app: appHost(host), ...(project === undefined ? {} : { project }) },
      params: [...new Set([...CAMPAIGN_PARAMS, ...(config.analytics.params ?? []),
        ...(config.waitlist ? [config.waitlist.referral ?? 'ref'] : [])])],
    },
    ...(m ? { messaging: { from: m.from, fromName: m.fromName ?? '', address: m.address, unsubscribeGroup: m.sendgrid.unsubscribeGroup } } : {}),
    ...(config.subscription ? { subscription: { trialDays: config.subscription.trialDays, price: config.subscription.stripe.price } } : {}),
    ...(config.waitlist ? { waitlist: { event: config.waitlist.event, referral: config.waitlist.referral ?? 'ref',
      template: config.waitlist.template, link: config.waitlist.link } } : {}),
    sequences: (config.sequences ?? []).map((q) => ({
      name: q.name,
      start: q.start,
      stop: [...(q.stop ?? [])],
      messages: q.messages.map((msg) => ({ template: msg.template, after: msg.after, afterMs: delayMs(msg.after)! })),
    })),
    experiments: (config.experiments ?? []).map((e) => ({
      flag: e.flag,
      path: normalizePath(e.path),
      variants: { ...e.variants },
      goal: e.goal,
      split: e.split ? { ...e.split } : evenSplit([CONTROL, ...Object.keys(e.variants)]),
      status: e.status,
    })),
  };
}

/** Whole percentages as even as they can be, the remainder going to the first keys. */
function evenSplit(keys: string[]): Record<string, number> {
  const base = Math.floor(100 / keys.length);
  const extra = 100 - base * keys.length;
  return Object.fromEntries(keys.map((k, i) => [k, base + (i < extra ? 1 : 0)]));
}

function appHost(host: string): string {
  const url = new URL(host);
  url.hostname = url.hostname.replace(/^([a-z]+)\.i\./, '$1.');
  return url.origin;
}
