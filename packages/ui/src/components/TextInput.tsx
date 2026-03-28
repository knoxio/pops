/**
 * TextInput component with variants, prefix/suffix, and clear functionality
 * Supports controlled and uncontrolled modes
 */
import { forwardRef, useState, type InputHTMLAttributes, type ReactNode } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../lib/utils";

const containerVariants = cva(
  "flex items-center gap-2 w-full bg-background text-foreground transition-all file:border-0 file:bg-transparent file:text-sm file:font-medium outline-0 focus:outline-0 focus-visible:outline-0 focus-within:outline-0 ring-0 focus:ring-0 focus-visible:ring-0 focus-within:ring-0",
  {
    variants: {
      variant: {
        default: "border border-border",
        ghost: "border-0 hover:bg-accent",
        underline: "border-0 border-b border-border",
      },
      size: {
        sm: "h-9 px-3 py-1 text-xs",
        default: "h-11 px-3 py-2 text-sm",
        lg: "h-12 px-4 py-2 text-base",
      },
      shape: {
        default: "rounded-md",
        pill: "rounded-full",
      },
    },
    compoundVariants: [
      {
        variant: "underline",
        shape: ["default", "pill"],
        class: "rounded-none",
      },
    ],
    defaultVariants: {
      variant: "default",
      size: "default",
      shape: "default",
    },
  }
);

const inputVariants = cva(
  "flex-1 bg-transparent border-0 outline-0 shadow-none focus:outline-0 focus:ring-0 focus:shadow-none focus-visible:outline-0 focus-visible:ring-0 placeholder:text-muted-foreground disabled:cursor-not-allowed",
  {
    variants: {
      size: {
        sm: "text-xs",
        default: "text-sm",
        lg: "text-base",
      },
      centered: {
        true: "text-center",
        false: "",
      },
    },
    defaultVariants: {
      size: "default",
      centered: false,
    },
  }
);

export interface TextInputProps
  extends
    Omit<InputHTMLAttributes<HTMLInputElement>, "size" | "prefix">,
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
export const TextInput = forwardRef<HTMLInputElement, TextInputProps>(
  (
    {
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
      ...props
    },
    ref
  ) => {
    const [internalValue, setInternalValue] = useState(defaultValue ?? "");
    const [isFocused, setIsFocused] = useState(false);
    const isControlled = controlledValue !== undefined;
    const value = isControlled ? controlledValue : internalValue;
    const hasValue = Boolean(value && String(value).length > 0);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!isControlled) {
        setInternalValue(e.target.value);
      }
      onChange?.(e);
    };

    const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
      setIsFocused(true);
      onFocus?.(e);
    };

    const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
      setIsFocused(false);
      onBlur?.(e);
    };

    const handleClear = () => {
      if (!isControlled) {
        setInternalValue("");
      }
      onClear?.();

      // Create a synthetic event to trigger onChange
      const syntheticEvent = {
        target: { value: "" },
      } as React.ChangeEvent<HTMLInputElement>;
      onChange?.(syntheticEvent);
    };

    const showClearButton = clearable && hasValue && !disabled;

    return (
      <div className="flex flex-col gap-1.5 w-full">
        {label && (
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-widest ml-1">
            {label}
          </label>
        )}
        <div
          className={cn(
            containerVariants({
              variant,
              size,
              shape,
            }),
            disabled && "opacity-50 cursor-not-allowed",
            error && "border-destructive ring-destructive/20",
            containerClassName
          )}
          style={isFocused && !error ? { borderColor: "var(--ring)" } : undefined}
        >
          {prefix && <span className="flex-shrink-0 text-muted-foreground">{prefix}</span>}
          <input
            ref={ref}
            className={cn(inputVariants({ size, centered, className }))}
            style={{ outline: "none", boxShadow: "none" }}
            value={value}
            onChange={handleChange}
            onFocus={handleFocus}
            onBlur={handleBlur}
            disabled={disabled}
            aria-invalid={!!error}
            {...props}
          />
          {showClearButton && (
            <button
              type="button"
              onClick={handleClear}
              className="flex-shrink-0 text-muted-foreground hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm p-1 min-w-11 min-h-11 inline-flex items-center justify-center"
              aria-label="Clear input"
              tabIndex={-1}
            >
              <XIcon />
            </button>
          )}
          {suffix && !showClearButton && (
            <span className="flex-shrink-0 text-muted-foreground">{suffix}</span>
          )}
        </div>
        {error && <p className="text-2xs font-medium text-destructive ml-1">{error}</p>}
      </div>
    );
  }
);

TextInput.displayName = "TextInput";

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
