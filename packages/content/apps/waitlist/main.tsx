// The waitlist card's connection to Claude, through the MCP Apps SDK (ADR-0049). The host hands the card
// the waitlist tool's result; the card's changes call the server's own tools, which answer the waitlist
// again. Light or dark follows the host's theme. The card shows the full list when Claude has it full
// screen, and asks for full screen from the "Open full list" click. A host that offers no full screen,
// or refuses, gets the full list in place instead.
import { applyDocumentTheme, type App, type McpUiHostContext } from '@modelcontextprotocol/ext-apps';
import { useApp } from '@modelcontextprotocol/ext-apps/react';
import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../theme.css';
import { WaitlistCard, type Change, type Outcome } from './card.tsx';
import type { Person } from './list.ts';

type Result = { structuredContent?: { people?: Person[] }; content?: { type: string; text?: string }[]; isError?: boolean };

const peopleOf = (result: Result): Person[] | undefined => result.structuredContent?.people;
const textOf = (result: Result): string => result.content?.find((c) => c.type === 'text')?.text ?? 'That did not work.';

function Root() {
  const [people, setPeople] = useState<Person[] | null>(null);
  const [context, setContext] = useState<McpUiHostContext | undefined>();
  const [inPlace, setInPlace] = useState(false);
  const { app, error } = useApp({
    appInfo: { name: 'cmokit-waitlist', version: '0.2.0' },
    capabilities: { availableDisplayModes: ['inline', 'fullscreen'] },
    onAppCreated: (created: App) => {
      created.ontoolresult = (result) => {
        const listed = peopleOf(result as Result);
        if (listed) setPeople(listed);
      };
      created.onhostcontextchanged = (changed) => {
        if (changed.theme) applyDocumentTheme(changed.theme);
        setContext(created.getHostContext());
      };
    },
  });
  useEffect(() => {
    const now = app?.getHostContext();
    if (now?.theme) applyDocumentTheme(now.theme);
    setContext(now);
  }, [app]);

  const fullscreen = context?.displayMode === 'fullscreen';
  // Claude grants full screen only from a recent click, so this runs straight from the button.
  const expand = async () => {
    if (app && context?.availableDisplayModes?.includes('fullscreen')) {
      const { mode } = await app.requestDisplayMode({ mode: 'fullscreen' });
      if (mode === 'fullscreen') return;
    }
    setInPlace(true);
  };
  const inset = fullscreen ? context?.safeAreaInsets : undefined;

  if (error) return <p className="p-4 text-problem">The card could not reach Claude: {error.message}</p>;

  const change = async (c: Change): Promise<Outcome> => {
    if (!app) return { tone: 'error', text: 'The card is not connected to Claude yet. Try again in a moment.' };
    const name = c.restore ? 'restored' : c.tool === 'waitlist_activate' ? 'activated' : 'declined';
    try {
      const result = await app.callServerTool({ name: c.tool, arguments: c.restore ? { email: c.email, restore: true } : { email: c.email } }) as Result;
      if (result.isError) return { tone: 'error', text: textOf(result) };
      const listed = peopleOf(result);
      if (listed) setPeople(listed);
      if (name === 'activated') return { tone: 'info', text: `Activated ${c.email}. CMO Kit sends no email yet, so tell them yourself.` };
      if (name === 'declined') return { tone: 'warning', text: `Declined ${c.email}. Nothing was sent. Find them under Declined to restore them.` };
      return { tone: 'info', text: `Restored ${c.email} to the waiting list.` };
    } catch (failed) {
      return { tone: 'error', text: `Could not reach CMO Kit: ${(failed as Error).message}` };
    }
  };

  return (
    <div style={inset && { paddingTop: inset.top, paddingRight: inset.right, paddingBottom: inset.bottom, paddingLeft: inset.left }}>
      <WaitlistCard people={people} change={change} view={fullscreen || inPlace ? 'full' : 'summary'} expand={expand} />
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<StrictMode><Root /></StrictMode>);
