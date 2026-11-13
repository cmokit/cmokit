// What the content server is handed as its account page (ADR-0051): the server-side renderer, with
// the browser's script and stylesheet as text. The package's build makes the script and stylesheet
// first, then bundles this module, React and all, into dist/apps/portal.js.
import type { Portal } from '../../src/pages.ts';
import script from '../../dist/apps/portal-client.js?raw';
import style from '../../dist/apps/portal-client.css?raw';
import { renderPortal } from './render.tsx';

export const portal: Portal = { render: renderPortal, script, style };
