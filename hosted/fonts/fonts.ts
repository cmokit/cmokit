// The two fonts of CMOkit's own look (ADR-0046), bundled into each hosted Worker as data by the
// `Data` rule in its wrangler.jsonc, from the Fontsource packages (SIL Open Font License 1.1). Each
// Worker serves them from its own origin, so the pages' content security policy allows `font-src 'self'`.
/// <reference path="./woff2.d.ts" />
import type { Fonts } from '@cmokit/issuer/look';
import display from '@fontsource-variable/schibsted-grotesk/files/schibsted-grotesk-latin-wght-normal.woff2';
import body from '@fontsource-variable/instrument-sans/files/instrument-sans-latin-wght-normal.woff2';

export const fonts: Fonts = { display, body };
