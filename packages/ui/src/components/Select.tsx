/**
 * Select component - styled dropdown for choosing from options
 * Native select with custom styling to match design system
 */
import { type VariantProps } from 'class-variance-authority';
import { forwardRef, type ReactNode, type SelectHTMLAttributes, useState } from 'react';

import { cn } from '../lib/utils';
import { containerVariants, selectVariants } from './Select.variants';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps
  extends
    Omit<SelectHTMLAttributes<HTMLSelectElement>, 'size' | 'prefix'>,
    VariantProps<typeof containerVariants> {
  label?: string;
  error?: string;
  options: SelectOption[];
  prefix?: ReactNode;
  centered?: boolean;
  placeholder?: string;
  containerClassName?: string;
}

/**
 * Select component
 *
 * @example
 * ```tsx
 * <Select options={[{ value: "1", label: "Option 1" }]} />
 * <Select placeholder="Choose..." options={options} />
 * ```
 */
export const Select = forwardRef<HTMLSelectElement, SelectProps>((props, ref) => {
  const {
    className,
    containerClassName,
    variant,
    size,
    shape,
    label,
    error,
    prefix,
    centered = false,
    options,
    placeholder,
    onFocus,
    onBlur,
    disabled,
    ...selectAttrs
  } = props;
  const [isFocused, setIsFocused] = useState(false);

  return (
    <div className="flex flex-col gap-1.5 w-full">
      {label && (
        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-widest ml-1">
          {label}
        </label>
      )}
      <SelectShell
        variant={variant}
        size={size}
        shape={shape}
        disabled={disabled}
        error={!!error}
        isFocused={isFocused}
        containerClassName={containerClassName}
        prefix={prefix}
      >
        <select
          ref={ref}
          className={cn(selectVariants({ size, centered, className }))}
          onFocus={(e) => {
            setIsFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setIsFocused(false);
            onBlur?.(e);
          }}
          disabled={disabled}
          aria-invalid={!!error}
          {...selectAttrs}
        >
          <SelectOptions options={options} placeholder={placeholder} />
        </select>
        <ChevronDownIcon />
      </SelectShell>
      {error && <p className="text-2xs font-medium text-destructive ml-1">{error}</p>}
    </div>
  );
});

function SelectOptions({
  options,
  placeholder,
}: {
  options: SelectOption[];
  placeholder?: string;
}) {
  return (
    <>
      {placeholder && (
        <option value="" disabled>
          {placeholder}
        </option>
      )}
      {options.map((option) => (
        <option key={option.value} value={option.value} disabled={option.disabled}>
          {option.label}
        </option>
      ))}
    </>
  );
}

interface SelectShellProps extends VariantProps<typeof containerVariants> {
  disabled?: boolean;
  error: boolean;
  isFocused: boolean;
  containerClassName?: string;
  prefix?: ReactNode;
  children: ReactNode;
}

function SelectShell({
  variant,
  size,
  shape,
  disabled,
  error,
  isFocused,
  containerClassName,
  prefix,
  children,
}: SelectShellProps) {
  return (
    <div
      className={cn(
        containerVariants({ variant, size, shape }),
        disabled && 'opacity-50 cursor-not-allowed',
        error && 'border-destructive ring-destructive/20',
        containerClassName
      )}
      style={isFocused && !error ? { borderColor: 'var(--ring)' } : undefined}
    >
      {prefix && <span className="flex-shrink-0 text-muted-foreground">{prefix}</span>}
      {children}
    </div>
  );
}

Select.displayName = 'Select';

function ChevronDownIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="absolute right-3 pointer-events-none text-muted-foreground"
      aria-hidden="true"
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}
