// `cmokit waitlist`: a maintainer reads a site's waitlist, ranked, and activates a person on it
// (ADR-0014). The site's lifecycle answers at the waitlist path through the edge; the waitlist key
// is read from the environment and goes nowhere but that site.

import { WAITLIST_PATH } from './index.ts';

export const WAITLIST_KEY_VARIABLE = 'CMOKIT_WAITLIST_KEY';

export interface Waitlisted {
  email: string;
  joined: string;
  code: string;
  referredBy: string | null;
  referrals: number;
  activated: string | null;
}

export interface WaitlistIo {
  env: Record<string, string | undefined>;
  fetch?: typeof fetch;
}

function request(site: string, io: WaitlistIo, path: string, init: RequestInit = {}): Promise<Response> {
  const key = io.env[WAITLIST_KEY_VARIABLE];
  if (!key) throw new Error(`${WAITLIST_KEY_VARIABLE} is not set`);
  const url = new URL(`${WAITLIST_PATH}${path}`, new URL(site).origin);
  if (url.protocol !== 'https:' && url.hostname !== 'localhost') throw new Error('--site must be an https address');
  return (io.fetch ?? fetch)(url, { ...init, headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' } });
}

async function problem(response: Response): Promise<Error> {
  const body = await response.json().catch(() => ({})) as { problem?: string };
  if (response.status === 401) return new Error(`the site refused ${WAITLIST_KEY_VARIABLE}`);
  if (response.status === 404 && !body.problem) return new Error('the site has no waitlist, or its lifecycle has no waitlist key');
  return new Error(body.problem ?? `the site answered ${response.status}`);
}

/** Everyone on the site's waitlist, those who referred the most people first. */
export async function readWaitlist(site: string, io: WaitlistIo): Promise<Waitlisted[]> {
  const response = await request(site, io, '');
  if (!response.ok) throw await problem(response);
  return ((await response.json()) as { waitlist: Waitlisted[] }).waitlist;
}

/** Activates the person with this address, and says whether the activation message went out. */
export async function activate(site: string, email: string, io: WaitlistIo): Promise<{ email: string; sent: boolean }> {
  const response = await request(site, io, '/activate', { method: 'POST', body: JSON.stringify({ email }) });
  if (!response.ok) throw await problem(response);
  const answer = (await response.json()) as { email: string; sent: boolean };
  return { email: answer.email, sent: answer.sent };
}

export function describeWaitlist(list: Waitlisted[]): string[] {
  if (list.length === 0) return ['Nobody has joined the waitlist yet.'];
  const width = Math.max(...list.map((p) => p.email.length));
  return list.map((p, i) => {
    const referrals = `${p.referrals} referral${p.referrals === 1 ? '' : 's'}`;
    const state = p.activated ? `activated ${p.activated.slice(0, 10)}` : 'waiting';
    return `${String(i + 1).padStart(3)}. ${p.email.padEnd(width)}  ${referrals}, joined ${p.joined.slice(0, 10)}, ${state}`;
  });
}

export function describeActivation({ email, sent }: { email: string; sent: boolean }): string {
  return sent ? `Activated ${email}, and sent the activation message.`
    : `Activated ${email}. No activation message was sent: they were already active, unsubscribed, or the site sends no messages yet.`;
}
