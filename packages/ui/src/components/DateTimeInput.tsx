/**
 * DateTime input components using native HTML date/time inputs
 * Includes DateInput, TimeInput, and DateTimeInput
 */
import { cva, type VariantProps } from 'class-variance-authority';
import { forwardRef, type InputHTMLAttributes, type ReactNode, useState } from 'react';

import { cn } from '../lib/utils';

const containerVariants = cva(
  'flex items-center gap-2 w-full bg-background text-foreground transition-all outline-0 focus-within:outline-0 ring-0 focus-within:ring-0',
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
      shape: {
        default: 'rounded-md',
        pill: 'rounded-full',
      },
    },
    compoundVariants: [{ variant: 'underline', shape: ['default', 'pill'], class: 'rounded-none' }],
    defaultVariants: { variant: 'default', size: 'default', shape: 'default' },
  }
);

const inputVariants = cva(
  'flex-1 bg-transparent border-0 outline-0 shadow-none focus:outline-0 focus:ring-0 focus:shadow-none focus-visible:outline-0 focus-visible:ring-0 disabled:cursor-not-allowed [color-scheme:light] dark:[color-scheme:dark]',
  {
    variants: {
      size: { sm: 'text-xs', default: 'text-sm', lg: 'text-base' },
      centered: { true: 'text-center', false: '' },
    },
    defaultVariants: { size: 'default', centered: false },
  }
);

interface BaseInputProps
  extends
    Omit<InputHTMLAttributes<HTMLInputElement>, 'size' | 'prefix' | 'type'>,
    VariantProps<typeof containerVariants> {
  prefix?: ReactNode;
  suffix?: ReactNode;
  centered?: boolean;
  containerClassName?: string;
}

interface NativeDateTimeInputProps extends BaseInputProps {
  type: 'date' | 'time' | 'datetime-local';
}

const NativeDateTimeInput = forwardRef<HTMLInputElement, NativeDateTimeInputProps>(
  (
    {
      className,
      containerClassName,
      variant,
      size,
      shape,
      prefix,
      suffix,
      onFocus,
      onBlur,
      disabled,
      type,
      ...props
    },
    ref
  ) => {
    const [isFocused, setIsFocused] = useState(false);

    return (
      <div
        className={cn(
          containerVariants({ variant, size, shape }),
          disabled && 'opacity-50 cursor-not-allowed',
          containerClassName
        )}
        style={isFocused ? { borderColor: 'var(--ring)' } : undefined}
      >
        {prefix && <span className="flex-shrink-0 text-muted-foreground">{prefix}</span>}
        <input
          ref={ref}
          type={type}
          className={cn(inputVariants({ size, className }))}
          onFocus={(e) => {
            setIsFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setIsFocused(false);
            onBlur?.(e);
          }}
          disabled={disabled}
          {...props}
        />
        {suffix && <span className="flex-shrink-0 text-muted-foreground">{suffix}</span>}
      </div>
    );
  }
);

NativeDateTimeInput.displayName = 'NativeDateTimeInput';

export type DateInputProps = BaseInputProps;
export const DateInput = forwardRef<HTMLInputElement, DateInputProps>((props, ref) => (
  <NativeDateTimeInput {...props} type="date" ref={ref} />
));
DateInput.displayName = 'DateInput';

export type TimeInputProps = BaseInputProps;
export const TimeInput = forwardRef<HTMLInputElement, TimeInputProps>((props, ref) => (
  <NativeDateTimeInput {...props} type="time" ref={ref} />
));
TimeInput.displayName = 'TimeInput';

export type DateTimeInputProps = BaseInputProps;
export const DateTimeInput = forwardRef<HTMLInputElement, DateTimeInputProps>((props, ref) => (
  <NativeDateTimeInput {...props} type="datetime-local" ref={ref} />
));
DateTimeInput.displayName = 'DateTimeInput';
