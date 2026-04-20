/**
 * TextInput component with variants, prefix/suffix, and clear functionality
 * Supports controlled and uncontrolled modes
 */
import { type VariantProps } from 'class-variance-authority';
import { forwardRef, type InputHTMLAttributes, type ReactNode } from 'react';

import { cn } from '../lib/utils';
import { useTextInput } from './TextInput.hooks';
import { containerVariants, inputVariants } from './TextInput.variants';

export interface TextInputProps
  extends
    Omit<InputHTMLAttributes<HTMLInputElement>, 'size' | 'prefix'>,
    VariantProps<typeof containerVariants> {
  /**
   * Label for the input
   */
  label?: string;
  /**
   * Error message to display
   */
  error?: string;
  /**
   * Icon or content to display before the input
   */
  prefix?: ReactNode;
  /**
   * Icon or content to display after the input
   */
  suffix?: ReactNode;
  /**
   * Whether to show the clear button when input has value
   */
  clearable?: boolean;
  /**
   * Callback when the clear button is clicked
   */
  onClear?: () => void;
  /**
   * Whether to center the text
   */
  centered?: boolean;
  /**
   * Container class name for styling the wrapper
   */
  containerClassName?: string;
}

/**
 * TextInput component
 *
 * @example
 * ```tsx
 * <TextInput placeholder="Enter text..." />
 * <TextInput variant="ghost" clearable />
 * <TextInput prefix={<SearchIcon />} />
 * <TextInput suffix={<Icon />} clearable />
 * ```
 */
interface TextInputBodyProps {
  ti: ReturnType<typeof useTextInput>;
  inputRef: React.Ref<HTMLInputElement>;
  prefix?: ReactNode;
  suffix?: ReactNode;
  clearable: boolean;
  disabled?: boolean;
  error?: string;
  onFocus?: (e: React.FocusEvent<HTMLInputElement>) => void;
  onBlur?: (e: React.FocusEvent<HTMLInputElement>) => void;
  inputClassName: string;
  inputProps: React.InputHTMLAttributes<HTMLInputElement>;
}

function TextInputBody({
  ti,
  inputRef,
  prefix,
  suffix,
  clearable,
  disabled,
  error,
  onFocus,
  onBlur,
  inputClassName,
  inputProps,
}: TextInputBodyProps) {
  const showClearButton = clearable && ti.hasValue && !disabled;
  return (
    <>
      {prefix && <span className="flex-shrink-0 text-muted-foreground">{prefix}</span>}
      <input
        ref={inputRef}
        className={inputClassName}
        value={ti.value}
        onChange={ti.handleChange}
        onFocus={(e) => {
          ti.setIsFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          ti.setIsFocused(false);
          onBlur?.(e);
        }}
        disabled={disabled}
        aria-invalid={!!error}
        {...inputProps}
      />
      <TrailingSlot showClearButton={showClearButton} suffix={suffix} onClear={ti.handleClear} />
    </>
  );
}

export const TextInput = forwardRef<HTMLInputElement, TextInputProps>((props, ref) => {
  const {
    className,
    containerClassName,
    variant,
    size,
    shape,
    label,
    error,
    prefix,
    suffix,
    clearable = false,
    onClear,
    centered = false,
    value: controlledValue,
    defaultValue,
    onChange,
    onFocus,
    onBlur,
    disabled,
    ...inputAttrs
  } = props;
  const ti = useTextInput({ controlledValue, defaultValue, onChange, onClear });

  return (
    <div className="flex flex-col gap-1.5 w-full">
      {label && (
        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-widest ml-1">
          {label}
        </label>
      )}
      <div
        className={cn(
          containerVariants({ variant, size, shape }),
          disabled && 'opacity-50 cursor-not-allowed',
          error && 'border-destructive ring-destructive/20',
          containerClassName
        )}
        style={ti.isFocused && !error ? { borderColor: 'var(--ring)' } : undefined}
      >
        <TextInputBody
          ti={ti}
          inputRef={ref}
          prefix={prefix}
          suffix={suffix}
          clearable={clearable}
          disabled={disabled}
          error={error}
          onFocus={onFocus}
          onBlur={onBlur}
          inputClassName={cn(inputVariants({ size, centered, className }))}
          inputProps={inputAttrs}
        />
      </div>
      {error && <p className="text-2xs font-medium text-destructive ml-1">{error}</p>}
    </div>
  );
});

TextInput.displayName = 'TextInput';

function TrailingSlot({
  showClearButton,
  suffix,
  onClear,
}: {
  showClearButton: boolean;
  suffix?: ReactNode;
  onClear: () => void;
}) {
  if (showClearButton) {
    return (
      <button
        type="button"
        onClick={onClear}
        className="flex-shrink-0 text-muted-foreground hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm p-1 min-w-11 min-h-11 inline-flex items-center justify-center"
        aria-label="Clear input"
        tabIndex={-1}
      >
        <XIcon />
      </button>
    );
  }
  if (suffix) return <span className="flex-shrink-0 text-muted-foreground">{suffix}</span>;
  return null;
}

/**
 * X icon for clear button
 */
function XIcon() {
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
      aria-hidden="true"
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}
