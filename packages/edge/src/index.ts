// The edge's handler, on web-standard Request and Response only (ADR-0003). It serves each visitor
// their variant of a page under experiment (ADR-0009), records exposures and conversions, and relays
// the browser's analytics. Its experiments are the configuration deployed with it, and only a running
// one is served. It keeps no state: a visitor's identity, variants and first arrival live in their
// cookies. Every query parameter reaches the page (SRV-05); analytics gets only those the site records,
// as properties, and never a URL's query string or fragment (MSR-08).

import {
  CAMPAIGN_PARAMS as CAMPAIGN,
  CONTROL,
  CONVERT_PATH,
  EMAIL,
  EVENT_NAME,
  FIRST_COOKIE,
  LEADS_PATH,
  SUBSCRIPTIONS_PATH,
  LEAD_COOKIE,
  PREVIEW_PARAM,
  RELAY_PATH,
  VISITOR_COOKIE,
  WAITLIST_PATH,
  bareUrl,
  leadKey,
  normalizePath,
  referralCode,
  variantCookie,
  type Experiment,
  type Resolved,
} from '@cmokit/cli';
import { isAgent } from './agents.ts';

export { isAgent };

/** Assigns variants. Answers undefined when the visitor is not in the experiment or the tool failed. */
export interface Experiments {
  variantFor(visitor: string, flag: string): Promise<string | undefined>;
}

export interface AnalyticsEvent {
  name: string;
  /** The visitor's id, or undefined for an event that belongs to no visitor. */
  visitor: string | undefined;
  properties: Record<string, unknown>;
}

export interface Analytics {
  capture(event: AnalyticsEvent): Promise<void>;
  /** Forwards a browser's analytics request; `path` is what follows the relay prefix. */
  relay(request: Request, path: string): Promise<Response>;
}

/** A lead the edge captured from a form that carried an email address. */
export interface CapturedLead {
  key: string;
  email: string;
  visitor: string;
  /** The conversion event that captured it. */
  event: string;
  /** The site's origin, where the lead's unsubscribe link points. */
  origin: string;
  /** The visitor's variants and channel, as analytics properties. */
  properties: Record<string, unknown>;
}

/** The lifecycle, which keeps each lead's sequence of messages (ADR-0014). */
export interface Lifecycle {
  capture(lead: CapturedLead): Promise<void>;
  /** A later conversion by a captured lead, which may end its sequence. */
  event(key: string, name: string): Promise<void>;
  /**
   * Passes on a public request under LEADS_PATH, SUBSCRIPTIONS_PATH or WAITLIST_PATH: an unsubscribe,
   * the sending service's events, the payment processor's, or a maintainer's request to read or
   * activate the waitlist, whose key the lifecycle checks.
   */
  forward(request: Request): Promise<Response>;
}

export interface Tools {
  experiments: Experiments;
  analytics: Analytics;
  /** Absent when the site sends no messages. */
  lifecycle?: Lifecycle;
}

export interface EdgeOptions {
  /** The site's configuration, resolved. */
  config: Resolved;
  /** Fetches from the site. */
  origin(request: Request): Promise<Response>;
  tools: Tools;
  /** Runs work after the response is sent. */
  background(work: Promise<unknown>): void;
  newVisitor?(): string;
}

const YEAR = 60 * 60 * 24 * 365;

/** The lifecycle's routes the public may reach through the edge. */
const PUBLIC_LEADS = new Set([
  `${LEADS_PATH}/unsubscribe`, `${LEADS_PATH}/events`, `${SUBSCRIPTIONS_PATH}/events`,
  WAITLIST_PATH, `${WAITLIST_PATH}/activate`,
]);

/** The query parameters that name a visit's channel: UTM parameters and ad platforms' click ids. */
export const CAMPAIGN_PARAMS: ReadonlySet<string> = new Set(CAMPAIGN);

/** The longest first-arrival cookie kept; a longer one is not set. */
const FIRST_MAX = 1024;

export function createEdge(options: EdgeOptions): (request: Request) => Promise<Response> {
  const newVisitor = options.newVisitor ?? (() => crypto.randomUUID());
  const later = (work: Promise<unknown>) => options.background(work.catch(() => undefined));
  const running = options.config.experiments.filter((e) => e.status === 'running');

  return async (request) => {
    const url = new URL(request.url);
    try {
      if (url.pathname === CONVERT_PATH) return await convert(request, running, options, later);
      if (url.pathname.startsWith(`${LEADS_PATH}/`) || url.pathname.startsWith(`${SUBSCRIPTIONS_PATH}/`)
        || url.pathname === WAITLIST_PATH || url.pathname.startsWith(`${WAITLIST_PATH}/`)) {
        const lifecycle = options.tools.lifecycle;
        if (!lifecycle || !PUBLIC_LEADS.has(url.pathname)) return new Response('Not found', { status: 404 });
        return await lifecycle.forward(request);
      }
      if (url.pathname.startsWith(`${RELAY_PATH}/`)) {
        return await options.tools.analytics.relay(request, url.pathname.slice(RELAY_PATH.length));
      }
      if (!isPage(request)) return await options.origin(request);
      return await page(request, url, options, newVisitor, later);
    } catch {
      return options.origin(request);
    }
  };
}

function isPage(request: Request): boolean {
  return (request.method === 'GET' || request.method === 'HEAD') &&
    (request.headers.get('accept') ?? '').includes('text/html');
}

async function page(
  request: Request,
  url: URL,
  options: EdgeOptions,
  newVisitor: () => string,
  later: (work: Promise<unknown>) => void,
): Promise<Response> {
  const { experiments } = options.config;
  const path = normalizePath(url.pathname);
  const experiment = experiments.find((e) => e.path === path);
  const cookies = parseCookies(request.headers.get('cookie'));
  const agent = isAgent(request);
  const previewing = url.searchParams.has(PREVIEW_PARAM);

  const owner = experiments.find((e) => Object.values(e.variants).some((v) => normalizePath(v) === path));
  if (owner && !previewing) return redirect(new URL(owner.path + url.search, url));
  const recorded = options.config.analytics.params;
  const first = agent || cookies[FIRST_COOKIE] ? [] : firstCookie(url, recorded);

  // A draft or ended experiment's page is served as the site has it, except to a preview.
  if (!experiment || (experiment.status !== 'running' && !previewing)) {
    const response = await options.origin(request);
    if (agent) return response;
    return withCookies(response, [...(cookies[VISITOR_COOKIE] ? [] : [visitorCookie(newVisitor())]), ...first]);
  }

  const { tools } = options;
  const known = (variant: string | undefined) =>
    variant !== undefined && (variant === CONTROL || variant in experiment.variants) ? variant : undefined;

  const preview = url.searchParams.get(PREVIEW_PARAM);
  if (preview !== null) {
    return uncached(await serve(request, url, experiment, known(preview) ?? CONTROL, options));
  }

  if (agent) {
    later(tools.analytics.capture({ name: 'agent_visit', visitor: undefined, properties: {
      ...visitProperties(request, url, recorded), $process_person_profile: false, user_agent: request.headers.get('user-agent') ?? '',
    } }));
    return uncached(await options.origin(request), { 'x-cmokit-agent': '1' });
  }

  const set: string[] = [...first];
  let visitor = cookies[VISITOR_COOKIE];
  if (!visitor) {
    visitor = newVisitor();
    set.push(visitorCookie(visitor));
  }

  // A visitor without a variant cookie is assigned by the tool; one the tool cannot place, or whose
  // variant's page is missing, is served the control unassigned, and asked again next time.
  let variant = known(cookies[variantCookie(experiment.flag)]);
  let assigned = false;
  if (variant === undefined) {
    variant = known(await tools.experiments.variantFor(visitor, experiment.flag).catch(() => undefined));
    assigned = variant !== undefined;
  }

  let response = await serve(request, url, experiment, variant ?? CONTROL, options);
  if (!response.ok && variant !== undefined && variant !== CONTROL) {
    response = await options.origin(request);
    variant = undefined;
    assigned = false;
  }
  if (assigned && variant !== undefined) set.push(cookie(variantCookie(experiment.flag), variant));

  if (variant !== undefined && response.ok) {
    later(tools.analytics.capture({ name: '$feature_flag_called', visitor, properties: {
      ...visitProperties(request, url, recorded), $feature_flag: experiment.flag, $feature_flag_response: variant,
      [`$feature/${experiment.flag}`]: variant,
    } }));
  }
  return withCookies(uncached(response), set);
}

async function serve(
  request: Request,
  url: URL,
  experiment: Experiment,
  variant: string,
  options: EdgeOptions,
): Promise<Response> {
  if (variant === CONTROL) return options.origin(request);
  // The variant's page gets the query the page was requested with, as the control does.
  const target = new URL(experiment.variants[variant], url);
  const query = new URLSearchParams(url.search);
  query.delete(PREVIEW_PARAM);
  target.search = query.toString();
  return options.origin(new Request(target, { method: request.method, headers: request.headers }));
}

async function convert(
  request: Request,
  running: Experiment[],
  options: EdgeOptions,
  later: (work: Promise<unknown>) => void,
): Promise<Response> {
  if (request.method !== 'POST') return new Response(null, { status: 405, headers: { allow: 'POST' } });
  const origin = request.headers.get('origin');
  const site = new URL(request.url).origin;
  if (origin && origin !== site) return new Response(null, { status: 403 });

  const cookies = parseCookies(request.headers.get('cookie'));
  const visitor = cookies[VISITOR_COOKIE];
  if (!visitor || isAgent(request)) return new Response(null, { status: 204 });

  const body = await request.json().catch(() => ({})) as { name?: unknown; email?: unknown };
  const name = typeof body.name === 'string' && EVENT_NAME.test(body.name) ? body.name : 'conversion';
  const email = typeof body.email === 'string' && EMAIL.test(body.email.trim()) ? body.email.trim() : undefined;
  const properties: Record<string, unknown> = {};
  for (const experiment of running) {
    const variant = cookies[variantCookie(experiment.flag)];
    if (variant) properties[`$feature/${experiment.flag}`] = variant;
  }
  // A conversion carries the parameters of the visitor's first arrival, wherever on the site it
  // happens, or else those of the page it happened on (MSR-08).
  const { tools, config } = options;
  const recorded = config.analytics.params;
  const page = request.headers.get('referer');
  if (page) properties.$current_url = bareUrl(page);
  const arrival = cookies[FIRST_COOKIE] !== undefined ? new URLSearchParams(cookies[FIRST_COOKIE])
    : page && URL.canParse(page) ? new URL(page).searchParams : new URLSearchParams();
  Object.assign(properties, pick(arrival, recorded));
  later(tools.analytics.capture({ name, visitor, properties: {
    ...properties, source: 'edge', ...(email ? { $set: { email } } : {}),
  } }));

  // A form with an address captures a lead into the sequence its event starts, or onto the waitlist;
  // a later conversion by the same visitor may end its sequence.
  const set: string[] = [];
  const waitlist = config.waitlist?.event === name ? config.waitlist : undefined;
  let answer: string | null = null;
  if (tools.lifecycle) {
    if (email && (waitlist || config.sequences.some((s) => s.start === name))) {
      const key = await leadKey(email);
      later(tools.lifecycle.capture({ key, email, visitor, event: name, origin: site, properties }));
      set.push(cookie(LEAD_COOKIE, key));
      // The person's own referral link is the page they joined on, carrying their code (ADR-0014).
      if (waitlist) {
        const link = new URL(page && URL.canParse(page) && new URL(page).origin === site ? bareUrl(page) : `${site}/`);
        link.searchParams.set(waitlist.referral, await referralCode(key));
        answer = JSON.stringify({ referral: link.href });
      }
    } else if (cookies[LEAD_COOKIE] && config.sequences.some((s) => s.stop.includes(name))) {
      later(tools.lifecycle.event(cookies[LEAD_COOKIE], name));
    }
  }
  const response = answer === null ? new Response(null, { status: 204 })
    : new Response(answer, { status: 200, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
  return withCookies(response, set);
}

/** What a visit records: its page without query or fragment, and the parameters the site records. */
function visitProperties(request: Request, url: URL, recorded: string[]): Record<string, unknown> {
  const properties: Record<string, unknown> = { $current_url: bareUrl(url.href), $pathname: url.pathname };
  const referrer = request.headers.get('referer');
  if (referrer) properties.$referrer = bareUrl(referrer);
  return { ...properties, ...pick(url.searchParams, recorded) };
}

function pick(query: URLSearchParams, recorded: string[]): Record<string, string> {
  const found: Record<string, string> = {};
  for (const [key, value] of query) if (recorded.includes(key)) found[key] = value;
  return found;
}

/** The first-arrival cookie for a page requested with parameters the site records, if it has any. */
function firstCookie(url: URL, recorded: string[]): string[] {
  const found = new URLSearchParams(pick(url.searchParams, recorded)).toString();
  return found && found.length <= FIRST_MAX ? [cookie(FIRST_COOKIE, found)] : [];
}

export function parseCookies(header: string | null): Record<string, string> {
  const cookies: Record<string, string> = {};
  for (const part of (header ?? '').split(';')) {
    const pair = part.trim();
    const at = pair.indexOf('=');
    if (at <= 0) continue;
    try {
      cookies[pair.slice(0, at)] = decodeURIComponent(pair.slice(at + 1));
    } catch {
      // A value that is not valid percent-encoding was not set by CMOkit.
    }
  }
  return cookies;
}

function cookie(name: string, value: string): string {
  return `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${YEAR}; SameSite=Lax; Secure`;
}

const visitorCookie = (visitor: string) => cookie(VISITOR_COOKIE, visitor);

function redirect(location: URL): Response {
  return new Response(null, { status: 302, headers: { location: location.href, 'cache-control': 'no-store' } });
}

function copy(response: Response): Response {
  return new Response(response.body, response);
}

function uncached(response: Response, headers: Record<string, string> = {}): Response {
  const out = copy(response);
  out.headers.set('cache-control', 'private, no-store');
  out.headers.append('vary', 'cookie');
  for (const [name, value] of Object.entries(headers)) out.headers.set(name, value);
  return out;
}

function withCookies(response: Response, cookies: string[]): Response {
  if (cookies.length === 0) return response;
  const out = copy(response);
  for (const value of cookies) out.headers.append('set-cookie', value);
  out.headers.set('cache-control', 'private, no-store');
  return out;
}
