/**
 * Select component - styled dropdown for choosing from options
 * Native select with custom styling to match design system
 */
import { forwardRef, useState, type SelectHTMLAttributes, type ReactNode } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../lib/utils";

const containerVariants = cva(
  "flex items-center gap-2 w-full bg-background text-foreground transition-all outline-0 focus-within:outline-0 ring-0 focus-within:ring-0 relative",
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

const selectVariants = cva(
  "flex-1 bg-transparent border-0 outline-0 shadow-none focus:outline-0 focus:ring-0 focus:shadow-none focus-visible:outline-0 focus-visible:ring-0 disabled:cursor-not-allowed appearance-none pr-8 cursor-pointer",
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

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps
  extends
    Omit<SelectHTMLAttributes<HTMLSelectElement>, "size" | "prefix">,
    VariantProps<typeof containerVariants> {
  /**
   * Label for the select
   */
  label?: string;
  /**
   * Error message to display
   */
  error?: string;
  /**
   * Select options
   */
  options: SelectOption[];
  /**
   * Icon or content to display before the select
   */
  prefix?: ReactNode;
  /**
   * Whether to center the text
   */
  centered?: boolean;
  /**
   * Placeholder text (shown as first disabled option)
   */
  placeholder?: string;
  /**
   * Container class name
   */
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
export const Select = forwardRef<HTMLSelectElement, SelectProps>(
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
      centered = false,
      options,
      placeholder,
      onFocus,
      onBlur,
      disabled,
      ...props
    },
    ref
  ) => {
    const [isFocused, setIsFocused] = useState(false);

    const handleFocus = (e: React.FocusEvent<HTMLSelectElement>) => {
      setIsFocused(true);
      onFocus?.(e);
    };

    const handleBlur = (e: React.FocusEvent<HTMLSelectElement>) => {
      setIsFocused(false);
      onBlur?.(e);
    };

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
          style={isFocused && !error ? { borderColor: "rgb(55, 65, 81)" } : undefined}
        >
          {prefix && <span className="flex-shrink-0 text-muted-foreground">{prefix}</span>}
          <select
            ref={ref}
            className={cn(selectVariants({ size, centered, className }))}
            style={{ outline: "none", boxShadow: "none" }}
            onFocus={handleFocus}
            onBlur={handleBlur}
            disabled={disabled}
            aria-invalid={!!error}
            {...props}
          >
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
          </select>
          <ChevronDownIcon />
        </div>
        {error && <p className="text-2xs font-medium text-destructive ml-1">{error}</p>}
      </div>
    );
  }
);

Select.displayName = "Select";

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
