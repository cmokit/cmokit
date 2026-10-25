// The lifecycle's handler, on web-standard Request and Response only (ADR-0003). It captures the
// leads the edge passes it into their sequences (ADR-0014), ends a lead's sequence on a stopping
// event, an unsubscribe or the sending service's report of a bounce or complaint, and records every
// message's events in analytics. Its internal routes are reached only through the edge's service
// binding; the edge passes on only the public ones, under LEADS_PATH.

import { EMAIL, LEADS_PATH, LIFECYCLE_EVENT, LIFECYCLE_LEAD, type Resolved } from '@cmokit/cli';
import type { Capture } from './lead.ts';

export { Lead, type Capture, type LeadDeps } from './lead.ts';
export { parse, render, type Rendered } from './render.ts';
export type { Row, Sql } from './sql.ts';

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

export interface LifecycleOptions {
  config: Resolved;
  leads: Leads;
  messaging: Messaging;
  analytics: Analytics;
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
    if (url.pathname === `${LEADS_PATH}/unsubscribe`) return unsubscribe(request, url);
    if (request.method === 'POST' && url.pathname === `${LEADS_PATH}/events`) return reports(request);
    return new Response('Not found', { status: 404 });
  };

  async function lead(request: Request): Promise<Response> {
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const { key, email, visitor, event: name, origin } = body;
    if (typeof key !== 'string' || typeof email !== 'string' || !EMAIL.test(email)
      || typeof visitor !== 'string' || typeof name !== 'string' || typeof origin !== 'string' || !URL.canParse(origin)) {
      return new Response(null, { status: 400 });
    }
    for (const sequence of config.sequences.filter((s) => s.start === name)) {
      const properties = typeof body.properties === 'object' && body.properties !== null
        ? body.properties as Record<string, unknown> : {};
      await leads.start({ key, email, visitor, sequence: sequence.name, origin: new URL(origin).origin, properties });
    }
    return new Response(null, { status: 204 });
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
    if (!config.sequences.some((s) => s.name === sequence)) return page('Unsubscribe', '<p>This link is not valid.</p>', 400);
    const email = await leads.unsubscribe(sequence, key, token);
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
      if (reason) await leads.stop(sequence, key, reason, report.id);
    }
    return new Response(null, { status: 204 });
  }
}

function page(title: string, body: string, status = 200): Response {
  return new Response(
    `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">`
      + `<meta name="robots" content="noindex"><title>${title}</title></head>`
      + `<body style="font-family:sans-serif;max-width:32em;margin:4em auto;padding:0 1em">${body}</body></html>`,
    { status, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } },
  );
}
