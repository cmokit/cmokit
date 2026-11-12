// CMOkit's own look (ADR-0046): the one stylesheet of the sign-in pages and the content server's
// pages, built from CMO Kit's design system, and the two fonts each Worker serves from its own origin.
// A page puts `LOOK` in its <style> and `HEADER` at the top of its <body>; nothing else in a page sets
// a color, a font or a size. Beside plain markup it styles three pieces: a bottom tab bar (`nav.tabs`,
// the current tab marked `aria-current`), stacked list rows (`ul.rows`) and a status badge (`.badge`, `.badge.next` for the step to take next).

/** The fonts a Worker serves at `/fonts/<name>.woff2`, as its adapter hands them over. Without them, pages fall back to the system font. */
export interface Fonts {
  /** Schibsted Grotesk, variable weight, Latin: headings and the wordmark. */
  display: ArrayBuffer;
  /** Instrument Sans, variable weight, Latin: everything else. */
  body: ArrayBuffer;
}

const FONT = /^\/fonts\/(display|body)\.woff2$/;

/**
 * Answers a request for one of the fonts, or undefined for any other path. A font is the same for
 * every page and every person, so it is cached and may be read from another origin.
 */
export function fontResponse(request: Request, fonts: Fonts | undefined): Response | undefined {
  const name = new URL(request.url).pathname.match(FONT)?.[1] as keyof Fonts | undefined;
  if (!name) return undefined;
  if (request.method !== 'GET' && request.method !== 'HEAD') return new Response(null, { status: 405, headers: { allow: 'GET, HEAD' } });
  if (!fonts) return new Response('Not found', { status: 404 });
  return new Response(request.method === 'HEAD' ? null : fonts[name], {
    headers: {
      'content-type': 'font/woff2',
      'cache-control': 'public, max-age=604800',
      'access-control-allow-origin': '*',
      'x-content-type-options': 'nosniff',
    },
  });
}

/** The open ring of the weekly loop, beside the wordmark, in the accent color. */
const MARK = '<svg class="mark" viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="10.5" fill="none" stroke="currentColor" stroke-width="5" stroke-dasharray="52 14" stroke-linecap="round" transform="rotate(-50 16 16)"/></svg>';

/** The app header every page opens with. */
export const HEADER = `<header class="bar"><span class="wordmark">${MARK}CMO Kit</span></header>`;

/** The stylesheet, minified only by hand. Light follows the person's setting, and dark is defined for every color. */
export const LOOK = `
@font-face{font-family:'Schibsted Grotesk';src:url(/fonts/display.woff2) format('woff2');font-weight:400 900;font-display:swap}
@font-face{font-family:'Instrument Sans';src:url(/fonts/body.woff2) format('woff2');font-weight:400 700;font-display:swap}
:root{
--bg:#f2efe8;--surface:#fffcf6;--sunk:#e9e4da;--ink:#1f1c18;--muted:#5c564e;--line:#ddd5c8;
--accent:#2d5a4a;--accent-strong:#234839;--on-accent:#fff;--focus:#2d5a4a;--problem:#9b2c1f;--problem-bg:#f8e7e2;
--display:'Schibsted Grotesk',system-ui,-apple-system,'Segoe UI',sans-serif;
--body:'Instrument Sans',system-ui,-apple-system,'Segoe UI',sans-serif;
--text-xs:.8125rem;--text-sm:.9375rem;--text-base:1.0625rem;--text-lg:1.25rem;--text-xl:1.625rem;
--space-1:.25rem;--space-2:.5rem;--space-3:.75rem;--space-4:1rem;--space-5:1.5rem;--space-6:2rem;--space-7:3rem;
--radius-sm:6px;--radius-md:10px;--radius-lg:16px;--pill:999px;
--gutter:clamp(1rem,4vw,2rem);color-scheme:light}
@media (prefers-color-scheme:dark){:root{
--bg:#141613;--surface:#1d201c;--sunk:#191b18;--ink:#ece8df;--muted:#a39c90;--line:#33362f;
--accent:#86c2a9;--accent-strong:#a3d3bf;--on-accent:#141613;--focus:#86c2a9;--problem:#f0a195;--problem-bg:#2e1d1a;color-scheme:dark}}
*,*::before,*::after{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;min-height:100vh;background:var(--bg);color:var(--ink);font-family:var(--body);font-size:var(--text-base);line-height:1.6;-webkit-font-smoothing:antialiased;
padding:0 max(var(--gutter),env(safe-area-inset-right,0px)) max(var(--space-7),env(safe-area-inset-bottom,0px)) max(var(--gutter),env(safe-area-inset-left,0px))}
body>*{max-width:32rem;margin-left:auto;margin-right:auto}
.bar{display:flex;align-items:center;min-height:4rem;margin-bottom:var(--space-5);border-bottom:1px solid var(--line);max-width:none;
margin-left:calc(-1*max(var(--gutter),env(safe-area-inset-left,0px)));margin-right:calc(-1*max(var(--gutter),env(safe-area-inset-right,0px)));
padding:env(safe-area-inset-top,0px) max(var(--gutter),env(safe-area-inset-right,0px)) 0 max(var(--gutter),env(safe-area-inset-left,0px))}
.wordmark{display:inline-flex;align-items:center;gap:var(--space-2);font-family:var(--display);font-size:var(--text-lg);font-weight:600;letter-spacing:-.01em}
.mark{width:1.375rem;height:1.375rem;color:var(--accent)}
h1,h2,h3{font-family:var(--display);font-weight:600;line-height:1.1;letter-spacing:-.025em;text-wrap:balance}
h1{font-size:var(--text-xl);margin:var(--space-5) auto var(--space-4)}
h2{font-size:var(--text-lg);margin:var(--space-7) auto var(--space-3);padding-top:var(--space-5);border-top:1px solid var(--line)}
h3{font-family:var(--body);font-size:var(--text-base);letter-spacing:0;line-height:1.3;margin:var(--space-5) auto var(--space-2)}
p,ul,form,pre,label{margin-top:0;margin-bottom:var(--space-4)}
p{text-wrap:pretty}
ul{padding-left:var(--space-5)}
li+li{margin-top:var(--space-2)}
li form{margin:var(--space-2) 0 0}
a{color:var(--accent);text-underline-offset:.18em;text-decoration-thickness:1px}
a:hover{color:var(--accent-strong)}
:focus-visible{outline:2px solid var(--focus);outline-offset:3px;border-radius:var(--radius-sm)}
strong{font-weight:600}
.note{font-size:var(--text-sm);color:var(--muted)}
label{display:block;font-size:var(--text-sm);font-weight:600}
input,textarea,button{font:inherit}
input:not([type=checkbox]):not([type=radio]):not([type=hidden]),textarea{display:block;width:100%;margin:var(--space-2) 0 var(--space-3);
background:var(--surface);color:var(--ink);border:1px solid var(--line);font-size:var(--text-base);font-weight:400}
input:not([type=checkbox]):not([type=radio]):not([type=hidden]){min-height:3rem;padding:0 var(--space-4);border-radius:var(--pill)}
textarea{padding:var(--space-3) var(--space-4);border-radius:var(--radius-md);resize:vertical}
input::placeholder,textarea::placeholder{color:var(--muted);opacity:1}
input:focus-visible,textarea:focus-visible{outline:2px solid var(--focus);outline-offset:1px;border-color:transparent}
input[type=checkbox],input[type=radio]{width:1.25rem;height:1.25rem;margin:0 var(--space-2) 0 0;vertical-align:-.25rem;accent-color:var(--accent)}
label:has(input[type=checkbox]),label:has(input[type=radio]){display:flex;align-items:flex-start;gap:var(--space-1);font-weight:400;font-size:var(--text-base);min-height:3rem;padding:var(--space-3) 0}
button{display:flex;align-items:center;justify-content:center;width:100%;min-height:3rem;margin:var(--space-2) 0;padding:0 var(--space-5);
border:1px solid var(--line);border-radius:var(--pill);background:transparent;color:var(--ink);font-size:var(--text-sm);font-weight:600;cursor:pointer;
transition:background-color 120ms ease,border-color 120ms ease}
button:hover{border-color:var(--muted)}
button.primary{background:var(--accent);border-color:var(--accent);color:var(--on-accent)}
button.primary:hover{background:var(--accent-strong);border-color:var(--accent-strong)}
li button{width:auto;min-height:2.75rem;display:inline-flex}
[role=status],[role=alert],.problem{padding:var(--space-3) var(--space-4);border-radius:var(--radius-md);border:1px solid var(--line);background:var(--surface)}
[role=alert],.problem{color:var(--problem);background:var(--problem-bg);border-color:transparent}
[role=status] strong,[role=alert] strong{font-weight:600}
pre{padding:var(--space-3) var(--space-4);background:var(--sunk);border-radius:var(--radius-md);white-space:pre-wrap;overflow-wrap:anywhere;font-size:var(--text-xs)}
code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
ul.rows{list-style:none;padding:0;border-top:1px solid var(--line)}
.rows li{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:var(--space-2) var(--space-4);margin:0;padding:var(--space-3) 0;border-bottom:1px solid var(--line)}
.rows form{margin:0}
.row-main{flex:1 1 14rem;min-width:0;display:flex;flex-direction:column;overflow-wrap:anywhere}
.badge{display:inline-flex;align-items:center;min-height:2rem;padding:0 var(--space-3);border-radius:var(--pill);background:var(--sunk);color:var(--muted);font-size:var(--text-xs);font-weight:600}
.badge.next{background:var(--accent);color:var(--on-accent)}
ol{padding-left:var(--space-5);margin-top:0;margin-bottom:var(--space-4)}
body:has(.tabs){padding-bottom:calc(5.5rem + env(safe-area-inset-bottom,0px))}
.tabs{position:fixed;left:0;right:0;bottom:0;max-width:none;margin:0;display:grid;grid-auto-flow:column;grid-auto-columns:1fr;
background:var(--surface);border-top:1px solid var(--line);padding:0 max(var(--gutter),calc((100% - 32rem)/2)) env(safe-area-inset-bottom,0px)}
.tabs a{display:flex;align-items:center;justify-content:center;min-height:3.5rem;color:var(--muted);font-size:var(--text-sm);font-weight:600;text-decoration:none;border-top:2px solid transparent;margin-top:-1px}
.tabs a[aria-current=page]{color:var(--accent);border-top-color:var(--accent)}
`;
