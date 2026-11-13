// A block of text to paste somewhere else, such as a form for a site, with a button that copies it.
// Without the clipboard, or before the page's script runs, the text is still there to select.
import { useState } from 'react';
import { Button } from './button.tsx';
import { cn } from './cn.ts';

export function CopyBlock({ text, label = 'Copy', className }: { text: string; label?: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };
  return (
    <div className={cn('overflow-hidden rounded-md border border-line bg-sunk', className)}>
      <pre className="m-0 max-h-64 overflow-auto px-4 py-3 text-xs leading-relaxed whitespace-pre-wrap [overflow-wrap:anywhere]"><code className="font-mono">{text}</code></pre>
      <div className="flex justify-end border-t border-line bg-surface px-2 py-1.5">
        <Button onClick={copy} aria-live="polite">{copied ? 'Copied' : label}</Button>
      </div>
    </div>
  );
}
