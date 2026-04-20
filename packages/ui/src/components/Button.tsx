/**
 * Button component with variants, sizes, states, and icon support
 * Follows shadcn/ui patterns with class-variance-authority
 */
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { type ButtonHTMLAttributes, forwardRef, type ReactNode } from 'react';

import { cn } from '../lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary/90',
        destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
        outline: 'border border-input bg-background hover:bg-accent hover:text-accent-foreground',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
        ghost: 'hover:bg-accent hover:text-accent-foreground',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-11 px-4 py-2',
        sm: 'h-9 px-3 text-sm',
        lg: 'h-11 px-8 text-lg',
        icon: 'h-11 w-11',
      },
      shape: {
        default: 'rounded-md',
        pill: 'rounded-full',
        square: 'rounded-none',
        circle: 'rounded-full',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
      shape: 'default',
    },
  }
);

export interface ButtonProps
  extends
    Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'prefix'>,
    VariantProps<typeof buttonVariants> {
  /**
   * Content to display inside the button
   */
  children?: ReactNode;
  /**
   * Icon or content to display before the button text
   */
  prefix?: ReactNode;
  /**
   * Icon or content to display after the button text
   */
  suffix?: ReactNode;
  /**
   * Whether the button is in a loading state
   * Shows a spinner and disables the button
   */
  loading?: boolean;
  /**
   * Accessible label for the loading state
   */
  loadingText?: string;
  /**
   * Render the button as its child component (via Radix Slot).
   * Useful for wrapping links (`<Button asChild><Link to="/" /></Button>`).
   * Incompatible with `loading`, `prefix`, and `suffix`.
   */
  asChild?: boolean;
}

/**
 * Button component
 *
 * @example
 * ```tsx
 * <Button>Click me</Button>
 * <Button variant="outline" size="sm">Small button</Button>
 * <Button loading>Loading...</Button>
 * <Button prefix={<Icon />}>With icon</Button>
 * ```
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant,
      size,
      shape,
      children,
      prefix,
      suffix,
      loading = false,
      loadingText = 'Loading',
      asChild = false,
      disabled,
      ...props
    },
    ref
  ) => {
    const isDisabled = disabled ?? loading;
    const mergedClassName = cn(buttonVariants({ variant, size, shape, className }));

    if (asChild) {
      return (
        <Slot ref={ref as never} className={mergedClassName} {...props}>
          {children}
        </Slot>
      );
    }

    return (
      <button
        ref={ref}
        className={mergedClassName}
        disabled={isDisabled}
        aria-busy={loading}
        aria-label={loading ? loadingText : undefined}
        {...props}
      >
        {loading ? (
          <>
            <Spinner />
            {children}
          </>
        ) : (
          <>
            {prefix && <span className="inline-flex shrink-0">{prefix}</span>}
            {children}
            {suffix && <span className="inline-flex shrink-0">{suffix}</span>}
          </>
        )}
      </button>
    );
  }
);

Button.displayName = 'Button';

/**
 * Spinner component for loading state
 */
function Spinner() {
  return (
    <svg
      className="animate-spin h-4 w-4"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
}
