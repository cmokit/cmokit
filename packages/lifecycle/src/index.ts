// The lifecycle's handler, on web-standard Request and Response only (ADR-0003). It captures the
// leads the edge passes it into their sequences (ADR-0014), ends a lead's sequence on a stopping
// event, an unsubscribe or the sending service's report of a bounce or complaint, and records every
// message's events in analytics. It keeps the site's waitlist: a form's event joins it, a maintainer
// reads it and activates people with the waitlist key, each activation sends the activation message,
// and a product asks whether an address is activated (ADR-0014). For a product that sells a
// subscription, it makes checkout and portal links and acts on the payment processor's events
// (ADR-0017, subscriptions.ts). Its internal routes are reached only through service bindings; the
// edge passes on only the public ones, under LEADS_PATH, SUBSCRIPTIONS_PATH and WAITLIST_PATH.

import {
  EMAIL, LEADS_PATH, LIFECYCLE_ACTIVATED, LIFECYCLE_CHECKOUT, LIFECYCLE_EVENT, LIFECYCLE_LEAD, LIFECYCLE_PORTAL,
  SUBSCRIPTIONS_PATH, WAITLIST_PATH, type Resolved,
} from '@cmokit/cli';
import type { Capture } from './lead.ts';
import { render } from './render.ts';
import type { createSubscriptions } from './subscriptions.ts';
import type { Activated, Joining, Waitlisted } from './waitlist.ts';

export { Lead, type Capture, type LeadDeps } from './lead.ts';
export { Waitlist, type Activated, type Joining, type Waitlisted } from './waitlist.ts';
export { parse, render, type Rendered } from './render.ts';
export type { Row, Sql } from './sql.ts';
export { accessFor, createSubscriptions, type Access, type Payments, type Product, type Subscription } from './subscriptions.ts';

/** A message ready to send. */
export interface Outgoing {
  to: string;
  from: string;
  fromName: string;
  subject: string;
  text: string;
  html: string;
  unsubscribeUrl: string;
  /** The sending service's unsubscribe group. */
  group: number;
  /** Carried through to the sending service's events. */
  tags: Record<string, string>;
}

/** What the sending service reports about a message it sent. */
export interface Report {
  /** Unique per event, so an event delivered twice acts once. */
  id: string;
  kind: 'delivered' | 'opened' | 'clicked' | 'bounced' | 'dropped' | 'spam_reported' | 'unsubscribed' | 'other';
  at: number;
  tags: Record<string, string>;
  url?: string;
}

export interface Messaging {
  send(message: Outgoing): Promise<void>;
  /** Adds an address to the unsubscribe group's suppressions. */
  suppress(email: string, group: number): Promise<void>;
  /** The reports in a request from the sending service, or undefined when it is not genuinely from it. */
  reports(request: Request): Promise<Report[] | undefined>;
}

export interface AnalyticsEvent {
  name: string;
  visitor: string;
  properties: Record<string, unknown>;
  /** Makes a repeated event one event in analytics. */
  id?: string;
  at?: number;
}

export interface Analytics {
  capture(event: AnalyticsEvent): Promise<void>;
}

/** Each lead's Durable Object, by sequence and key. */
export interface Leads {
  start(capture: Capture): Promise<void>;
  stop(sequence: string, key: string, reason: string, eventId?: string): Promise<void>;
  /** As `Lead.unsubscribe`. */
  unsubscribe(sequence: string, key: string, token: string): Promise<string | null | undefined>;
}

/** The site's waitlist Durable Object. */
export interface WaitlistCalls {
  join(joining: Joining): Promise<void>;
  list(): Promise<Waitlisted[]>;
  /** As `Waitlist.activate`, with `found` false for an address not on the list. */
  activate(email: string): Promise<{ found: boolean; activated?: Activated }>;
  isActivated(email: string): Promise<boolean>;
  unsubscribe(key: string, token: string): Promise<string | undefined>;
}

/** The name a waitlist's messages carry where a sequence's name would be; no sequence may take it. */
export const WAITLIST = 'waitlist';

export interface LifecycleOptions {
  config: Resolved;
  leads: Leads;
  messaging: Messaging;
  analytics: Analytics;
  /** Each message template's text, by name, for the waitlist's activation message. */
  templates?: Record<string, string>;
  /** False when no message can be sent, so no lead is captured into a sequence it would fail. */
  sending?: boolean;
  /** Present when the configuration has a waitlist. */
  waitlist?: WaitlistCalls;
  /** The key a maintainer's waitlist requests carry. Without one, the waitlist cannot be read or activated. */
  waitlistKey?: string;
  /** Absent when the product sells no subscription, or the payment processor is not set up. */
  subscriptions?: ReturnType<typeof createSubscriptions>;
}

const STOPPING: Partial<Record<Report['kind'], string>> = {
  bounced: 'bounced', dropped: 'dropped', spam_reported: 'spam reported', unsubscribed: 'unsubscribed',
};

export function createLifecycle(options: LifecycleOptions): (request: Request) => Promise<Response> {
  const { config, leads } = options;

  return async (request) => {
    const url = new URL(request.url);
    if (request.method === 'POST' && url.pathname === LIFECYCLE_LEAD) return lead(request);
    if (request.method === 'POST' && url.pathname === LIFECYCLE_EVENT) return event(request);
    if (request.method === 'POST' && url.pathname === LIFECYCLE_ACTIVATED) return activated(request);
    if (url.pathname === WAITLIST_PATH || url.pathname === `${WAITLIST_PATH}/activate`) return admin(request, url);
    if (url.pathname === `${LEADS_PATH}/unsubscribe`) return unsubscribe(request, url);
    if (request.method === 'POST' && url.pathname === `${LEADS_PATH}/events`) return reports(request);
    const subscriptions = options.subscriptions;
    if (subscriptions && request.method === 'POST') {
      if (url.pathname === LIFECYCLE_CHECKOUT) return subscriptions.checkout(request);
      if (url.pathname === LIFECYCLE_PORTAL) return subscriptions.portal(request);
      if (url.pathname === `${SUBSCRIPTIONS_PATH}/events`) return subscriptions.events(request);
    }
    return new Response('Not found', { status: 404 });
  };

  async function lead(request: Request): Promise<Response> {
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const { key, email, visitor, event: name, origin } = body;
    if (typeof key !== 'string' || typeof email !== 'string' || !EMAIL.test(email)
      || typeof visitor !== 'string' || typeof name !== 'string' || typeof origin !== 'string' || !URL.canParse(origin)) {
      return new Response(null, { status: 400 });
    }
    const properties = typeof body.properties === 'object' && body.properties !== null
      ? body.properties as Record<string, unknown> : {};
    const site = new URL(origin).origin;
    const joins = config.waitlist?.event === name && options.waitlist ? config.waitlist : undefined;
    if (joins) {
      const referredBy = properties[joins.referral];
      await options.waitlist!.join({ key, email, visitor, origin: site, ...(typeof referredBy === 'string' ? { referredBy } : {}) });
    }
    const starting = config.sequences.filter((s) => s.start === name);
    if (starting.length > 0 && options.sending === false) {
      return joins ? new Response(null, { status: 204 }) : new Response('No message can be sent', { status: 503 });
    }
    for (const sequence of starting) {
      await leads.start({ key, email, visitor, sequence: sequence.name, origin: site, properties });
    }
    return new Response(null, { status: 204 });
  }

  async function activated(request: Request): Promise<Response> {
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    if (typeof body.email !== 'string') return new Response(null, { status: 400 });
    return Response.json({ activated: options.waitlist ? await options.waitlist.isActivated(body.email) : false });
  }

  // A maintainer reads the waitlist, ranked, and activates people from it, with the waitlist key.
  async function admin(request: Request, url: URL): Promise<Response> {
    const { waitlist, waitlistKey } = options;
    if (!waitlist || !config.waitlist || !waitlistKey) return new Response('Not found', { status: 404 });
    const given = request.headers.get('authorization')?.match(/^Bearer (\S+)$/i)?.[1] ?? '';
    if (!(await same(given, waitlistKey))) return new Response(null, { status: 401, headers: { 'www-authenticate': 'Bearer' } });
    if (url.pathname === WAITLIST_PATH) {
      if (request.method !== 'GET') return new Response(null, { status: 405, headers: { allow: 'GET' } });
      return Response.json({ waitlist: await waitlist.list() }, { headers: { 'cache-control': 'no-store' } });
    }
    if (request.method !== 'POST') return new Response(null, { status: 405, headers: { allow: 'POST' } });
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    if (typeof body.email !== 'string' || !EMAIL.test(body.email.trim())) return new Response(null, { status: 400 });
    const result = await waitlist.activate(body.email);
    if (!result.found) return Response.json({ email: body.email, activated: false, problem: 'not on the waitlist' }, { status: 404 });
    const sent = result.activated ? await sendActivation(result.activated) : false;
    return Response.json({ email: body.email, activated: true, sent });
  }

  /** Sends the activation message; false when it could not be sent, so the maintainer tells the person. */
  async function sendActivation(person: Activated): Promise<boolean> {
    const { waitlist, messaging } = config;
    const template = options.templates?.[waitlist!.template];
    if (!messaging || template === undefined || options.sending === false) return false;
    const unsubscribeUrl = `${person.origin}${LEADS_PATH}/unsubscribe?s=${WAITLIST}&l=${person.key}&t=${person.token}`;
    try {
      const content = render(template.replaceAll('{{link}}', waitlist!.link), {
        site: new URL(person.origin).host, unsubscribeUrl, address: messaging.address,
      });
      await options.messaging.send({
        to: person.email, from: messaging.from, fromName: messaging.fromName, ...content, unsubscribeUrl,
        group: messaging.unsubscribeGroup,
        tags: { cmokit_lead: person.key, cmokit_visitor: person.visitor, cmokit_sequence: WAITLIST, cmokit_message: waitlist!.template },
      });
    } catch (error) {
      console.error(`waitlist activation message: ${(error as Error).message}`);
      return false;
    }
    await options.analytics.capture({ name: 'waitlist_activated', visitor: person.visitor, properties: {} }).catch(() => undefined);
    return true;
  }

  async function event(request: Request): Promise<Response> {
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const { key, event: name } = body;
    if (typeof key !== 'string' || typeof name !== 'string') return new Response(null, { status: 400 });
    for (const sequence of config.sequences.filter((s) => s.stop.includes(name))) {
      await leads.stop(sequence.name, key, `converted: ${name}`);
    }
    return new Response(null, { status: 204 });
  }

  // A link in a message is often fetched by a mail scanner, so following it only asks; the button,
  // and a mail client's one-click unsubscribe (RFC 8058), both POST.
  async function unsubscribe(request: Request, url: URL): Promise<Response> {
    const sequence = url.searchParams.get('s') ?? '';
    const key = url.searchParams.get('l') ?? '';
    const token = url.searchParams.get('t') ?? '';
    if (request.method === 'GET') {
      return page('Unsubscribe', `<form method="post"><p>Stop the emails you signed up for?</p>`
        + `<button type="submit">Unsubscribe</button></form>`);
    }
    if (request.method !== 'POST') return new Response(null, { status: 405, headers: { allow: 'GET, POST' } });
    const fromWaitlist = sequence === WAITLIST && options.waitlist !== undefined;
    if (!fromWaitlist && !config.sequences.some((s) => s.name === sequence)) return page('Unsubscribe', '<p>This link is not valid.</p>', 400);
    const email = fromWaitlist ? await options.waitlist!.unsubscribe(key, token) : await leads.unsubscribe(sequence, key, token);
    if (email === undefined) return page('Unsubscribe', '<p>This link is not valid.</p>', 400);
    for (const other of config.sequences.filter((s) => s.name !== sequence)) {
      await leads.stop(other.name, key, 'unsubscribed');
    }
    // The sequences have ended whatever the sending service answers, so the person is told so.
    if (email && config.messaging) {
      await options.messaging.suppress(email, config.messaging.unsubscribeGroup)
        .catch((error: Error) => console.error(`suppressing an unsubscribed address: ${error.message}`));
    }
    return page('Unsubscribed', '<p>You are unsubscribed, and will get no more of these emails.</p>');
  }

  async function reports(request: Request): Promise<Response> {
    const found = await options.messaging.reports(request);
    if (!found) return new Response(null, { status: 403 });
    for (const report of found) {
      const { cmokit_lead: key, cmokit_visitor: visitor, cmokit_sequence: sequence, cmokit_message: message } = report.tags;
      if (!key || !visitor || !sequence) continue;
      if (report.kind !== 'other') {
        await options.analytics.capture({
          name: `message_${report.kind}`, visitor, id: report.id, at: report.at,
          properties: { sequence, message, ...(report.url ? { url: report.url } : {}) },
        }).catch(() => undefined);
      }
      const reason = STOPPING[report.kind];
      if (reason && config.sequences.some((s) => s.name === sequence)) await leads.stop(sequence, key, reason, report.id);
    }
    return new Response(null, { status: 204 });
  }
}

/** Compares two keys without the time it takes telling how much of them matched. */
async function same(given: string, expected: string): Promise<boolean> {
  const digest = async (text: string) => new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
  const [a, b] = await Promise.all([digest(given), digest(expected)]);
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a[i] ^ b[i];
  return difference === 0 && given.length > 0;
}

function page(title: string, body: string, status = 200): Response {
  return new Response(
    `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">`
      + `<meta name="robots" content="noindex"><title>${title}</title></head>`
      + `<body style="font-family:sans-serif;max-width:32em;margin:4em auto;padding:0 1em">${body}</body></html>`,
    { status, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } },
  );
}
