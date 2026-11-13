// shadcn's button, in CMOkit's look: primary for the one action a row asks for, the rest quiet.
import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentProps } from 'react';
import { cn } from './cn.ts';

export const buttonVariants = cva(
  'inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-full font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 cursor-pointer',
  {
    variants: {
      variant: {
        primary: 'bg-accent text-on-accent hover:bg-accent-strong',
        outline: 'border border-line bg-surface text-ink hover:bg-sunk',
        ghost: 'text-muted hover:bg-sunk hover:text-ink',
      },
      size: {
        sm: 'h-9 px-3.5 text-xs',
        md: 'h-11 px-4 text-sm',
        icon: 'h-9 w-9 text-sm',
      },
    },
    defaultVariants: { variant: 'outline', size: 'sm' },
  },
);

export function Button({ className, variant, size, type = 'button', ...props }: ComponentProps<'button'> & VariantProps<typeof buttonVariants>) {
  return <button type={type} className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}
