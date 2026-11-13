// A dismissable notice: info for what just happened, warning for what to watch, error for what failed.
// It is announced to screen readers, and an error more urgently.
import { cva, type VariantProps } from 'class-variance-authority';
import type { ReactNode } from 'react';
import { cn } from './cn.ts';

const noticeVariants = cva('flex items-start gap-3 rounded-md border px-3.5 py-3 text-sm', {
  variants: {
    tone: {
      info: 'border-line bg-surface text-ink',
      warning: 'border-line bg-sunk text-ink',
      error: 'border-problem/40 bg-problem-bg text-problem',
    },
  },
  defaultVariants: { tone: 'info' },
});

export function Notice({ tone, children, onDismiss, className }: VariantProps<typeof noticeVariants> & {
  children: ReactNode;
  onDismiss?: () => void;
  className?: string;
}) {
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={cn(noticeVariants({ tone }), className)}>
      <div className="min-w-0 flex-1">{children}</div>
      {onDismiss && (
        <button type="button" onClick={onDismiss} aria-label="Dismiss" className="-my-1 -mr-1.5 h-8 w-8 shrink-0 rounded-full text-base leading-none opacity-70 hover:opacity-100 cursor-pointer">
          ×
        </button>
      )}
    </div>
  );
}
