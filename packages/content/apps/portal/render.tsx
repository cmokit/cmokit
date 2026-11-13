// Renders the account page on the server (ADR-0051), the same component tree the browser's script
// then makes interactive.
import { renderToString } from 'react-dom/server';
import type { AccountTab, AccountView } from '../../src/pages.ts';
import { Portal } from './portal.tsx';

export function renderPortal(view: AccountView, tab: AccountTab): string {
  return renderToString(<Portal view={view} tab={tab} />);
}
