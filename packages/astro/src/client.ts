// The browser script on every page. It starts PostHog with the visitor's CMOkit identity and variants
// from the edge's cookies, so the browser evaluates no flags and records no exposures of its own
// (ADR-0010), and records a conversion when a form marked `data-cmokit-convert` is submitted. A form
// with an email field also captures the visitor as a lead, server-side (ADR-0014); one that joins a
// waitlist is handed the person's referral link, in the `cmokit:converted` event's detail. PostHog
// records pages and conversions only: no autocapture, no session recording, and no URL's query string
// or fragment (MSR-08).

import { posthog, type CaptureResult } from 'posthog-js';
import { VISITOR_COOKIE, bareUrl, variantCookie } from '@cmokit/cli';

export interface ClientOptions {
  key: string;
  apiHost: string;
  uiHost: string;
  flags: string[];
  /** Where conversions are sent, or `browser` to capture them from the page. */
  convert: string;
}

function readCookie(name: string): string | undefined {
  for (const part of document.cookie.split(';')) {
    const pair = part.trim();
    if (pair.startsWith(`${name}=`)) return decodeURIComponent(pair.slice(name.length + 1));
  }
  return undefined;
}

export function start(options: ClientOptions): void {
  const visitor = readCookie(VISITOR_COOKIE);
  const variants: Record<string, string> = {};
  for (const flag of options.flags) {
    const variant = readCookie(variantCookie(flag));
    if (variant) variants[flag] = variant;
  }

  posthog.init(options.key, {
    api_host: options.apiHost,
    ui_host: options.uiHost,
    person_profiles: 'always',
    advanced_disable_feature_flags: true,
    autocapture: false,
    disable_session_recording: true,
    before_send: withoutQueries,
    ...(visitor ? { bootstrap: { distinctID: visitor, isIdentifiedID: false, featureFlags: variants } } : {}),
  });
  posthog.register(Object.fromEntries(Object.entries(variants).map(([flag, v]) => [`$feature/${flag}`, v])));

  document.addEventListener('submit', (event) => {
    const form = (event.target as Element | null)?.closest<HTMLFormElement>('form[data-cmokit-convert]');
    if (!form) return;
    event.preventDefault();
    const name = form.dataset.cmokitConvert || 'conversion';
    const email = form.querySelector<HTMLInputElement>('input[type="email"]')?.value.trim() || undefined;
    const done = (referral?: string) => {
      form.dataset.cmokitState = 'done';
      form.dispatchEvent(new CustomEvent('cmokit:converted', { bubbles: true, detail: { name, ...(referral ? { referral } : {}) } }));
    };
    if (options.convert === 'browser') {
      posthog.capture(name, { source: 'browser' });
      done();
      return;
    }
    fetch(options.convert, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name, ...(email ? { email } : {}) }),
      keepalive: true,
    }).then(async (response) => {
      const answer = response.status === 200 ? await response.json().catch(() => ({})) as { referral?: unknown } : {};
      done(typeof answer.referral === 'string' ? answer.referral : undefined);
    }, () => done());
  });
}

/** Takes the query string and fragment off every URL an event or its person properties carry. */
export function withoutQueries(event: CaptureResult | null): CaptureResult | null {
  if (!event) return event;
  for (const bag of [event.properties, event.$set, event.$set_once, event.properties?.$set, event.properties?.$set_once]) {
    if (!bag || typeof bag !== 'object') continue;
    for (const [key, value] of Object.entries(bag)) {
      if (typeof value === 'string' && /(url|referrer)$/i.test(key)) bag[key] = bareUrl(value);
    }
  }
  return event;
}
