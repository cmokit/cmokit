// The edge's handler, on web-standard Request and Response only (ADR-0003). It serves each visitor
// their variant of a page under experiment (ADR-0009), records exposures and conversions, and relays
// the browser's analytics. Its experiments are the configuration deployed with it, and only a running
// one is served. It keeps no state: a visitor's identity and variants live in their cookies.

import {
  CONTROL,
  CONVERT_PATH,
  EVENT_NAME,
  PREVIEW_PARAM,
  RELAY_PATH,
  VISITOR_COOKIE,
  normalizePath,
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

export interface Tools {
  experiments: Experiments;
  analytics: Analytics;
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

export function createEdge(options: EdgeOptions): (request: Request) => Promise<Response> {
  const newVisitor = options.newVisitor ?? (() => crypto.randomUUID());
  const later = (work: Promise<unknown>) => options.background(work.catch(() => undefined));
  const running = options.config.experiments.filter((e) => e.status === 'running');

  return async (request) => {
    const url = new URL(request.url);
    try {
      if (url.pathname === CONVERT_PATH) return await convert(request, running, options.tools, later);
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

  // A draft or ended experiment's page is served as the site has it, except to a preview.
  if (!experiment || (experiment.status !== 'running' && !previewing)) {
    const response = await options.origin(request);
    if (agent || cookies[VISITOR_COOKIE]) return response;
    return withCookies(response, [visitorCookie(newVisitor())]);
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
      ...visitProperties(request, url), $process_person_profile: false, user_agent: request.headers.get('user-agent') ?? '',
    } }));
    return uncached(await options.origin(request), { 'x-cmokit-agent': '1' });
  }

  const set: string[] = [];
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
      ...visitProperties(request, url), $feature_flag: experiment.flag, $feature_flag_response: variant,
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
  const target = new URL(experiment.variants[variant], url);
  return options.origin(new Request(target, { method: request.method, headers: request.headers }));
}

async function convert(
  request: Request,
  running: Experiment[],
  tools: Tools,
  later: (work: Promise<unknown>) => void,
): Promise<Response> {
  if (request.method !== 'POST') return new Response(null, { status: 405, headers: { allow: 'POST' } });
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) return new Response(null, { status: 403 });

  const cookies = parseCookies(request.headers.get('cookie'));
  const visitor = cookies[VISITOR_COOKIE];
  if (!visitor || isAgent(request)) return new Response(null, { status: 204 });

  const body = await request.json().catch(() => ({})) as { name?: unknown };
  const name = typeof body.name === 'string' && EVENT_NAME.test(body.name) ? body.name : 'conversion';
  const variants: Record<string, string> = {};
  for (const experiment of running) {
    const variant = cookies[variantCookie(experiment.flag)];
    if (variant) variants[`$feature/${experiment.flag}`] = variant;
  }
  const page = request.headers.get('referer');
  later(tools.analytics.capture({ name, visitor, properties: {
    ...variants, ...(page ? { $current_url: page } : {}), source: 'edge',
  } }));
  return new Response(null, { status: 204 });
}

function visitProperties(request: Request, url: URL): Record<string, unknown> {
  const properties: Record<string, unknown> = { $current_url: url.href, $pathname: url.pathname };
  const referrer = request.headers.get('referer');
  if (referrer) properties.$referrer = referrer;
  for (const [key, value] of url.searchParams) if (key.startsWith('utm_')) properties[key] = value;
  return properties;
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
