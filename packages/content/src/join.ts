// Joining a brand's waitlist from any page (LEAD-04, ADR-0043): a form on a static site, such as one
// on GitHub Pages, posts to /join/<brand> here, with no Worker of the site's own. Only pages on the
// site addresses the brand's users listed may add people, and the answer is the person's referral
// link: the page they joined on, with every query parameter it had, carrying their own code, and
// their place in line, with the address where they connect Instagram to move up more (ADR-0045). The
// page's tracking tags are kept with the person. It uses the web-standard Request and Response only
// (ADR-0003).

import type { WaitlistDetails, WaitlistJoined } from './customer.ts';

/** The query parameter that carries a referral code. */
export const REFERRAL = 'ref';
/** A field a person never fills in: a form that arrives with it filled was sent by a bot. */
export const TRAP = 'website';

/** What joining needs from the brand's records. */
export interface JoinCalls {
  waitlistSites(): Promise<string[]>;
  waitlistJoin(email: string, details?: WaitlistDetails): Promise<WaitlistJoined>;
  instagramStart?(kind: 'member', code: string, back?: string): Promise<string>;
}

export interface JoinOptions {
  /** Whether a visitor may join now; false slows a flood of joins from one place. Absent, every join is let through. */
  allow?(key: string): Promise<boolean>;
  /** Instagram's page to connect an account, for the value a start hands back; absent with no Instagram app. */
  instagram?(start: string): string;
}

const EMAIL = /^[^\s@]{1,64}@[^\s@]+\.[^\s@]+$/;
/** The page's query parameters kept as where a person came from: the tracking tags (ADR-0031). */
const TAG = /^utm_[a-z]{1,20}$/;

export async function handleJoin(request: Request, customer: JoinCalls, options: JoinOptions = {}): Promise<Response> {
  const origin = request.headers.get('origin');
  const sites = origin ? await customer.waitlistSites() : [];
  const allowed = origin !== null && sites.includes(origin);
  const cors: Record<string, string> = allowed ? { 'access-control-allow-origin': origin!, vary: 'origin' } : {};

  if (request.method === 'OPTIONS') {
    if (!allowed) return new Response(null, { status: 403 });
    return new Response(null, {
      status: 204,
      headers: { ...cors, 'access-control-allow-methods': 'POST', 'access-control-allow-headers': 'content-type', 'access-control-max-age': '86400' },
    });
  }
  if (request.method !== 'POST') return new Response(null, { status: 405, headers: { allow: 'POST, OPTIONS' } });
  if (!allowed) return new Response('This page is not one of the brand\'s sites, so it cannot add people to its waitlist.', { status: 403 });

  const fields = await read(request);
  const wantsJson = (request.headers.get('accept') ?? '').includes('application/json');
  const answer = (status: number, body: Answer) => wantsJson
    ? Response.json(body, { status, headers: { ...cors, 'cache-control': 'no-store' } })
    : page(status, body, cors);

  const email = (fields.email ?? '').trim();
  if (email.length > 254 || !EMAIL.test(email)) return answer(400, { problem: 'Enter an email address.' });
  const link = referralLink(fields.page, origin!);
  const source = tags(link);
  // A bot that filled the trap is answered as if it joined, and nothing is kept.
  if (fields[TRAP]) return answer(200, { referral: link.href });
  const ip = request.headers.get('cf-connecting-ip') ?? '';
  if (options.allow && !(await options.allow(ip))) return answer(429, { problem: 'Too many tries. Wait a minute and try again.' });

  const details: WaitlistDetails = { source };
  const ref = fields.ref?.trim();
  if (ref) details.ref = ref;
  const back = link.href;
  const { code, place } = await customer.waitlistJoin(email, details);
  link.searchParams.set(REFERRAL, code);
  const instagram = options.instagram && customer.instagramStart
    ? options.instagram(await customer.instagramStart('member', code, back)) : undefined;
  return answer(200, { referral: link.href, place, ...(instagram ? { instagram } : {}) });
}

interface Answer {
  referral?: string;
  /** Their place in line, from 1; null once they are activated. */
  place?: WaitlistJoined['place'];
  /** Instagram's page where they connect their account to move up more. */
  instagram?: string;
  problem?: string;
}

/** The page's tracking tags, each cut to a sane length. */
function tags(page: URL): Record<string, string> {
  const kept: Record<string, string> = {};
  for (const [name, value] of page.searchParams) {
    if (TAG.test(name) && value && !(name in kept)) kept[name] = value.slice(0, 100);
  }
  return kept;
}

/**
 * The page the person joined on, with every query parameter it had and no fragment, when it is on
 * the site that sent the form; the site's home page otherwise.
 */
function referralLink(page: string | undefined, origin: string): URL {
  const link = page && URL.canParse(page) && new URL(page).origin === origin ? new URL(page) : new URL(`${origin}/`);
  link.hash = '';
  return link;
}

async function read(request: Request): Promise<Record<string, string | undefined>> {
  const type = request.headers.get('content-type') ?? '';
  if (type.includes('application/json')) {
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    return Object.fromEntries(Object.entries(body).filter(([, v]) => typeof v === 'string')) as Record<string, string>;
  }
  const form = await request.formData().catch(() => new FormData());
  return Object.fromEntries([...form.entries()].filter(([, v]) => typeof v === 'string')) as Record<string, string>;
}

/** The answer to a form sent with no script: a short page with the person's link. */
function page(status: number, body: Answer, cors: Record<string, string>): Response {
  const main = body.referral
    ? `<h1>${body.place ? `You're number ${body.place} on the list` : "You're on the list"}</h1><p>Share your link. Everyone who joins through it moves you up.</p><p><a href="${escape(body.referral)}">${escape(body.referral)}</a></p>`
      + (body.instagram ? `<p>${CONNECT_LINE} <a href="${escape(body.instagram)}">Connect Instagram</a></p><p>${PROFESSIONAL_LINE}</p>` : '')
    : `<h1>That didn't work</h1><p>${escape(body.problem ?? 'Try again.')}</p>`;
  return new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Waitlist</title>`
    + `<style>body{font:16px/1.5 system-ui,sans-serif;max-width:36rem;margin:3rem auto;padding:0 1rem}a{word-break:break-all}</style></head>`
    + `<body>${main}</body></html>`,
    { status, headers: { ...cors, 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } },
  );
}

function escape(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

/** What the third step of the funnel says, beside its Connect Instagram button. */
export const CONNECT_LINE = 'Boost even more: connect your Instagram, then comment on our Reels. Each Reel you comment on moves you up.';
/** What it says about the accounts Instagram lets connect. */
export const PROFESSIONAL_LINE = 'This needs an Instagram business or creator account. You can switch to one in Instagram\'s settings.';

/**
 * The form and script a brand's site pastes into a page to let people join its waitlist. It is a
 * funnel: join with an address; then share the referral link to move up; then connect Instagram and
 * comment on the brand's Reels to move up more. The last step shows only when the brand's waitlist
 * offers it.
 */
export function joinSnippet(action: string): string {
  return `<div data-cmokit-waitlist>
<form method="post" action="${action}" data-cmokit-join>
  <input type="email" name="email" required placeholder="you@example.com" aria-label="Email">
  <input type="text" name="${TRAP}" tabindex="-1" autocomplete="off" hidden>
  <button type="submit">Join the waitlist</button>
</form>
<div data-cmokit-joined hidden>
  <p data-cmokit-place>You're on the list.</p>
  <p>Boost your place: share your referral link. Everyone who joins through it moves you up.<br><a data-cmokit-referral></a></p>
</div>
<div data-cmokit-instagram hidden>
  <p>${CONNECT_LINE}</p>
  <p><a data-cmokit-connect>Connect Instagram</a></p>
  <p><small>${PROFESSIONAL_LINE.replace(/'/g, '&#39;')}</small></p>
</div>
</div>
<script>
document.querySelectorAll('[data-cmokit-waitlist]').forEach((box) => {
  const join = box.querySelector('[data-cmokit-join]');
  join.addEventListener('submit', async (event) => {
    event.preventDefault();
    const body = new URLSearchParams(new FormData(join));
    body.set('page', location.href);
    body.set('${REFERRAL}', new URLSearchParams(location.search).get('${REFERRAL}') || '');
    const response = await fetch(join.action, { method: 'POST', body, headers: { accept: 'application/json' } });
    const answer = await response.json().catch(() => ({}));
    if (!answer.referral) return alert(answer.problem || 'That did not work. Try again.');
    const link = box.querySelector('[data-cmokit-referral]');
    link.href = link.textContent = answer.referral;
    if (answer.place) box.querySelector('[data-cmokit-place]').textContent = "You're number " + answer.place + ' on the list.';
    join.hidden = true;
    box.querySelector('[data-cmokit-joined]').hidden = false;
    if (answer.instagram) {
      box.querySelector('[data-cmokit-connect]').href = answer.instagram;
      box.querySelector('[data-cmokit-instagram]').hidden = false;
    }
    box.dispatchEvent(new CustomEvent('cmokit:joined', { bubbles: true, detail: { referral: answer.referral, place: answer.place ?? null } }));
  });
});
</script>`;
}
