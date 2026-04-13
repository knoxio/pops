/**
 * Chip component for tags, labels, and removable items
 * Supports multiple colors, sizes, and optional remove button
 */
import { cva, type VariantProps } from 'class-variance-authority';
import { forwardRef, type HTMLAttributes, type ReactNode } from 'react';

import { cn } from '../lib/utils';

const chipVariants = cva(
  'inline-flex items-center font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-full',
  {
    variants: {
      variant: {
        default: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
        primary: 'bg-primary text-primary-foreground hover:bg-primary/90',
        destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
        success: 'bg-success text-white hover:bg-success/80',
        warning: 'bg-warning text-white hover:bg-warning/80',
        info: 'bg-info text-white hover:bg-info/80',
        outline: 'border border-input bg-background hover:bg-accent hover:text-accent-foreground',
        ghost: 'hover:bg-accent hover:text-accent-foreground',
      },
      size: {
        sm: 'gap-2 px-3 py-1.5 text-sm',
        default: 'gap-2 px-3 py-1 text-xs',
        lg: 'gap-2 px-4 py-2 text-base',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

export interface ChipProps
  extends Omit<HTMLAttributes<HTMLDivElement>, 'prefix'>, VariantProps<typeof chipVariants> {
  /**
   * Content to display inside the chip
   */
  children?: ReactNode;
  /**
   * Icon or content to display before the chip text
   */
  prefix?: ReactNode;
  /**
   * Whether to show the remove button
   */
  removable?: boolean;
  /**
   * Callback when the remove button is clicked
   */
  onRemove?: () => void;
  /**
   * Accessible label for the remove button
   */
  removeLabel?: string;
}

/**
 * Chip component
 *
 * @example
 * ```tsx
 * <Chip>Default chip</Chip>
 * <Chip variant="primary">Primary</Chip>
 * <Chip removable onRemove={() => console.log('removed')}>Removable</Chip>
 * <Chip prefix={<Icon />}>With icon</Chip>
 * ```
 */
export const Chip = forwardRef<HTMLDivElement, ChipProps>(
  (
    {
      className,
      variant,
      size,
      children,
      prefix,
      removable = false,
      onRemove,
      removeLabel = 'Remove',
      ...props
    },
    ref
  ) => {
    return (
      <div ref={ref} className={cn(chipVariants({ variant, size, className }))} {...props}>
        {prefix && <span className="inline-flex shrink-0">{prefix}</span>}
        <span className="truncate">{children}</span>
        {removable && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onRemove?.();
            }}
            className="inline-flex shrink-0 items-center justify-center rounded-sm opacity-70 hover:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring transition-opacity p-1 min-w-11 min-h-11"
            aria-label={removeLabel}
          >
            <XIcon />
          </button>
        )}
      </div>
    );
  }
);

Chip.displayName = 'Chip';

/**
 * X icon for remove button
 */
function XIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}
