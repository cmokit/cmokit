// The account page's script (ADR-0051): it reads the view the server rendered the page from and makes
// that same page interactive, so the notice can be dismissed and the form copied.
import { hydrateRoot } from 'react-dom/client';
import type { AccountTab, AccountView } from '../../src/pages.ts';
import './portal.css';
import { Portal } from './portal.tsx';

const { view, tab } = JSON.parse(document.getElementById('portal-view')!.textContent!) as { view: AccountView; tab: AccountTab };
hydrateRoot(document.getElementById('root')!, <Portal view={view} tab={tab} />);
