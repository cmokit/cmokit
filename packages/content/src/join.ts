// Joining a brand's waitlist from any page (LEAD-04, ADR-0043): a form on a static site, such as one
// on GitHub Pages, posts to /join/<brand> here, with no Worker of the site's own. Only pages on the
// site addresses the brand's users listed may add people, and the answer is the person's referral
// link: the page they joined on, with every query parameter it had, carrying their own code. It uses
// the web-standard Request and Response only (ADR-0003).

/** The query parameter that carries a referral code. */
export const REFERRAL = 'ref';
/** A field a person never fills in: a form that arrives with it filled was sent by a bot. */
export const TRAP = 'website';

/** What joining needs from the brand's records. */
export interface JoinCalls {
  waitlistSites(): Promise<string[]>;
  waitlistJoin(email: string, ref?: string): Promise<{ code: string; joined: boolean }>;
}

export interface JoinOptions {
  /** Whether a visitor may join now; false slows a flood of joins from one place. Absent, every join is let through. */
  allow?(key: string): Promise<boolean>;
}

const EMAIL = /^[^\s@]{1,64}@[^\s@]+\.[^\s@]+$/;

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
  const answer = (status: number, body: { referral?: string; problem?: string }) => wantsJson
    ? Response.json(body, { status, headers: { ...cors, 'cache-control': 'no-store' } })
    : page(status, body, cors);

  const email = (fields.email ?? '').trim();
  if (email.length > 254 || !EMAIL.test(email)) return answer(400, { problem: 'Enter an email address.' });
  const link = referralLink(fields.page, origin!);
  // A bot that filled the trap is answered as if it joined, and nothing is kept.
  if (fields[TRAP]) return answer(200, { referral: link.href });
  const ip = request.headers.get('cf-connecting-ip') ?? '';
  if (options.allow && !(await options.allow(ip))) return answer(429, { problem: 'Too many tries. Wait a minute and try again.' });

  const { code } = await customer.waitlistJoin(email, fields.ref?.trim() || undefined);
  link.searchParams.set(REFERRAL, code);
  return answer(200, { referral: link.href });
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
function page(status: number, body: { referral?: string; problem?: string }, cors: Record<string, string>): Response {
  const main = body.referral
    ? `<h1>You're on the list</h1><p>Share your link. Everyone who joins through it moves you up.</p><p><a href="${escape(body.referral)}">${escape(body.referral)}</a></p>`
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

/** The form and script a brand's site pastes into a page to let people join its waitlist. */
export function joinSnippet(action: string): string {
  return `<form method="post" action="${action}" data-cmokit-waitlist>
  <input type="email" name="email" required placeholder="you@example.com" aria-label="Email">
  <input type="text" name="${TRAP}" tabindex="-1" autocomplete="off" hidden>
  <button type="submit">Join the waitlist</button>
  <p data-cmokit-referral hidden>You're on the list. Share your link: <a></a></p>
</form>
<script>
document.querySelectorAll('form[data-cmokit-waitlist]').forEach((form) => {
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const body = new URLSearchParams(new FormData(form));
    body.set('page', location.href);
    body.set('${REFERRAL}', new URLSearchParams(location.search).get('${REFERRAL}') || '');
    const response = await fetch(form.action, { method: 'POST', body, headers: { accept: 'application/json' } });
    const answer = await response.json().catch(() => ({}));
    if (!answer.referral) return alert(answer.problem || 'That did not work. Try again.');
    const shown = form.querySelector('[data-cmokit-referral]');
    shown.querySelector('a').href = shown.querySelector('a').textContent = answer.referral;
    shown.hidden = false;
    form.dispatchEvent(new CustomEvent('cmokit:joined', { bubbles: true, detail: { referral: answer.referral } }));
  });
});
</script>`;
}
