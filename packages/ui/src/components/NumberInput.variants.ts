import { cva } from 'class-variance-authority';

export const containerVariants = cva(
  'flex items-center gap-2 w-full bg-background text-foreground transition-all outline-0 focus:outline-0 focus-visible:outline-0 focus-within:outline-0 ring-0 focus:ring-0 focus-visible:ring-0 focus-within:ring-0',
  {
    variants: {
      variant: {
        default: 'border border-border',
        ghost: 'border-0 hover:bg-accent',
        underline: 'border-0 border-b border-border',
      },
      size: {
        sm: 'h-9 px-3 py-1 text-xs',
        default: 'h-11 px-3 py-2 text-sm',
        lg: 'h-12 px-4 py-2 text-base',
      },
      shape: { default: 'rounded-md', pill: 'rounded-full' },
    },
    compoundVariants: [{ variant: 'underline', shape: ['default', 'pill'], class: 'rounded-none' }],
    defaultVariants: { variant: 'default', size: 'default', shape: 'default' },
  }
);

export const inputVariants = cva(
  'flex-1 bg-transparent border-0 outline-0 shadow-none focus:outline-0 focus:ring-0 focus:shadow-none focus-visible:outline-0 focus-visible:ring-0 placeholder:text-muted-foreground disabled:cursor-not-allowed',
  {
    variants: {
      size: { sm: 'text-xs', default: 'text-sm', lg: 'text-base' },
      centered: { true: 'text-center', false: '' },
    },
    defaultVariants: { size: 'default', centered: true },
  }
);
