// shadcn's input, textarea and label, in CMOkit's look: a pill for one line, a rounded box for more.
import type { ComponentProps } from 'react';
import { cn } from './cn.ts';

const field = 'block w-full border border-line bg-surface text-base text-ink placeholder:text-muted focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus';

export function Input({ className, ...props }: ComponentProps<'input'>) {
  return <input className={cn(field, 'h-12 rounded-full px-4', className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<'textarea'>) {
  return <textarea className={cn(field, 'rounded-md px-4 py-3', className)} {...props} />;
}

export function Label({ className, ...props }: ComponentProps<'label'>) {
  return <label className={cn('block text-sm font-semibold text-ink', className)} {...props} />;
}
