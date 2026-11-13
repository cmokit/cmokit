// shadcn's badge, in CMOkit's look: a person's state, or a count beside a filter.
import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentProps } from 'react';
import { cn } from './cn.ts';

const badgeVariants = cva('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium tabular-nums whitespace-nowrap', {
  variants: {
    variant: {
      quiet: 'bg-sunk text-muted',
      accent: 'bg-accent text-on-accent',
      problem: 'bg-problem-bg text-problem',
    },
  },
  defaultVariants: { variant: 'quiet' },
});

export function Badge({ className, variant, ...props }: ComponentProps<'span'> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
