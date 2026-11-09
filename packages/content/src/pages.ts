// The one-time page on which a person enters a key for a vendor that only issues keys (ADR-0019).
// The key travels from the person's browser to the content server, never through a conversation.

export function keyPage(page: { label: string; help: string; token: string; problem?: string }): Response {
  return html(`<h1>Connect ${escape(page.label)}</h1>
<p>${escape(page.help)}</p>
${page.problem ? `<p role="alert"><strong>${escape(page.problem)}</strong></p>` : ''}
<form method="post">
  <input type="hidden" name="t" value="${escape(page.token)}">
  <label for="key">${escape(page.label)} API key</label>
  <input id="key" name="key" type="password" autocomplete="off" required>
  <button type="submit">Connect</button>
</form>
<p>CMOkit checks the key with ${escape(page.label)}, keeps it encrypted for this account alone, and never shows it again.</p>`, page.problem ? 400 : 200);
}

export function donePage(label: string, calendar: string): Response {
  return html(`<h1>${escape(label)} is connected</h1>
<p>CMOkit can now read the calendar ${escape(calendar)}. Close this page and go back to Claude.</p>`, 200);
}

export function gonePage(): Response {
  return html('<h1>This link has expired</h1><p>It was already used, or is more than a few minutes old. Ask Claude for a new one.</p>', 410);
}

const SUBSCRIPTION = {
  started: ['Your trial has started', 'Close this page and go back to Claude, and ask it to carry on setting up.'],
  cancelled: ['No subscription was started', 'Nothing was charged. Close this page and go back to Claude whenever you are ready.'],
  managed: ['You are back from billing', 'Close this page and go back to Claude.'],
} as const;

/** Where the payment processor's hosted pages send the person back to. */
export function subscriptionPage(state: string): Response {
  const [title, text] = SUBSCRIPTION[state as keyof typeof SUBSCRIPTION] ?? SUBSCRIPTION.managed;
  return html(`<h1>${title}</h1><p>${text}</p>`, 200);
}

function html(body: string, status: number): Response {
  return new Response(`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="no-referrer"><title>CMOkit</title>
<style>body{font:16px/1.5 system-ui,sans-serif;max-width:32rem;margin:2rem auto;padding:0 1rem}
input,button{font:inherit;display:block;width:100%;margin:.5rem 0;padding:.5rem;box-sizing:border-box}</style>
</head><body>${body}</body></html>`, {
    status,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
      'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'",
    },
  });
}

function escape(text: string): string {
  return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}
