// Shared test fixtures: a configuration with a sequence, its templates, and a lead on Node's SQLite.

import { DatabaseSync } from 'node:sqlite';
import { resolve, type Config } from '@cmokit/cli';
import { Lead, type AnalyticsEvent, type Messaging, type Outgoing, type Report, type Sql } from '../src/index.ts';

export const CONFIG: Config = {
  analytics: { posthog: { key: 'phc_test', project: 7 } },
  messaging: { from: 'hello@site.example', fromName: 'Site', address: '1 Main St, Springfield', sendgrid: { unsubscribeGroup: 42 } },
  sequences: [
    {
      name: 'welcome', start: 'signup', stop: ['trial_started'],
      messages: [{ template: 'welcome', after: '0m' }, { template: 'follow-up', after: '3d' }],
    },
    { name: 'webinar', start: 'webinar', messages: [{ template: 'welcome', after: '1h' }] },
  ],
};

export const TEMPLATES: Record<string, string> = {
  welcome: '---\nsubject: Welcome aboard\n---\nThanks for signing up. Read [the guide](https://site.example/guide?a=1&b=2).',
  'follow-up': '---\nsubject: "Three days in"\n---\nHow is it **going**?',
};

export const resolved = resolve(CONFIG);

export function sqlite(): Sql {
  const db = new DatabaseSync(':memory:');
  return { all: (query, ...params) => db.prepare(query).all(...params) as ReturnType<Sql['all']> };
}

/** A stand-in for the messaging interface that records what it is asked, and fails when told to. */
export function messagingStandIn(reports: Report[] = []) {
  const sent: Outgoing[] = [];
  const suppressed: string[] = [];
  let failing = false;
  const messaging: Messaging = {
    async send(message) {
      if (failing) throw new Error('SendGrid is down');
      sent.push(message);
    },
    async suppress(email, group) {
      if (failing) throw new Error('SendGrid is down');
      suppressed.push(`${group}:${email}`);
    },
    async reports(request) {
      return request.headers.get('x-genuine') === 'yes' ? reports : undefined;
    },
  };
  return { messaging, sent, suppressed, fail: (on: boolean) => { failing = on; } };
}

export function analyticsStandIn() {
  const events: AnalyticsEvent[] = [];
  return { analytics: { capture: async (e: AnalyticsEvent) => void events.push(e) }, events };
}

export function newLead(m = messagingStandIn(), a = analyticsStandIn()) {
  const lead = new Lead(sqlite(), { config: resolved, templates: TEMPLATES, messaging: m.messaging, analytics: a.analytics, newToken: () => 'tok' });
  return { lead, ...m, ...a };
}

export const CAPTURE = {
  key: 'k1', email: 'ada@example.com', visitor: 'v1', sequence: 'welcome', origin: 'https://site.example',
  properties: { '$feature/landing': 'b', utm_source: 'news' },
};
