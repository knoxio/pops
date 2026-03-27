/**
 * DateTime input components using native HTML date/time inputs
 * Includes DateInput, TimeInput, and DateTimeInput
 */
import { forwardRef, useState, type InputHTMLAttributes, type ReactNode } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../lib/utils";

const containerVariants = cva(
  "flex items-center gap-2 w-full bg-background text-foreground transition-all outline-0 focus-within:outline-0 ring-0 focus-within:ring-0",
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
  "flex-1 bg-transparent border-0 outline-0 shadow-none focus:outline-0 focus:ring-0 focus:shadow-none focus-visible:outline-0 focus-visible:ring-0 disabled:cursor-not-allowed [color-scheme:light] dark:[color-scheme:dark]",
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

interface BaseInputProps
  extends
    Omit<InputHTMLAttributes<HTMLInputElement>, "size" | "prefix" | "type">,
    VariantProps<typeof containerVariants> {
  /**
   * Icon or content to display before the input
   */
  prefix?: ReactNode;
  /**
   * Icon or content to display after the input
   */
  suffix?: ReactNode;
  /**
   * Whether to center the text
   */
  centered?: boolean;
  /**
   * Container class name
   */
  containerClassName?: string;
}

// Date Input
export type DateInputProps = BaseInputProps;

export const DateInput = forwardRef<HTMLInputElement, DateInputProps>(
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
      ...props
    },
    ref
  ) => {
    const [isFocused, setIsFocused] = useState(false);

    const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
      setIsFocused(true);
      onFocus?.(e);
    };

    const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
      setIsFocused(false);
      onBlur?.(e);
    };

    return (
      <div
        className={cn(
          containerVariants({
            variant,
            size,
            shape,
          }),
          disabled && "opacity-50 cursor-not-allowed",
          containerClassName
        )}
        style={isFocused ? { borderColor: "rgb(55, 65, 81)" } : undefined}
      >
        {prefix && <span className="flex-shrink-0 text-muted-foreground">{prefix}</span>}
        <input
          ref={ref}
          type="date"
          className={cn(inputVariants({ size, className }))}
          style={{ outline: "none", boxShadow: "none" }}
          onFocus={handleFocus}
          onBlur={handleBlur}
          disabled={disabled}
          {...props}
        />
        {suffix && <span className="flex-shrink-0 text-muted-foreground">{suffix}</span>}
      </div>
    );
  }
);

DateInput.displayName = "DateInput";

// Time Input
export type TimeInputProps = BaseInputProps;

export const TimeInput = forwardRef<HTMLInputElement, TimeInputProps>(
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
      ...props
    },
    ref
  ) => {
    const [isFocused, setIsFocused] = useState(false);

    const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
      setIsFocused(true);
      onFocus?.(e);
    };

    const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
      setIsFocused(false);
      onBlur?.(e);
    };

    return (
      <div
        className={cn(
          containerVariants({
            variant,
            size,
            shape,
          }),
          disabled && "opacity-50 cursor-not-allowed",
          containerClassName
        )}
        style={isFocused ? { borderColor: "rgb(55, 65, 81)" } : undefined}
      >
        {prefix && <span className="flex-shrink-0 text-muted-foreground">{prefix}</span>}
        <input
          ref={ref}
          type="time"
          className={cn(inputVariants({ size, className }))}
          style={{ outline: "none", boxShadow: "none" }}
          onFocus={handleFocus}
          onBlur={handleBlur}
          disabled={disabled}
          {...props}
        />
        {suffix && <span className="flex-shrink-0 text-muted-foreground">{suffix}</span>}
      </div>
    );
  }
);

TimeInput.displayName = "TimeInput";

// DateTime Input
export type DateTimeInputProps = BaseInputProps;

export const DateTimeInput = forwardRef<HTMLInputElement, DateTimeInputProps>(
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
      ...props
    },
    ref
  ) => {
    const [isFocused, setIsFocused] = useState(false);

    const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
      setIsFocused(true);
      onFocus?.(e);
    };

    const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
      setIsFocused(false);
      onBlur?.(e);
    };

    return (
      <div
        className={cn(
          containerVariants({
            variant,
            size,
            shape,
          }),
          disabled && "opacity-50 cursor-not-allowed",
          containerClassName
        )}
        style={isFocused ? { borderColor: "rgb(55, 65, 81)" } : undefined}
      >
        {prefix && <span className="flex-shrink-0 text-muted-foreground">{prefix}</span>}
        <input
          ref={ref}
          type="datetime-local"
          className={cn(inputVariants({ size, className }))}
          style={{ outline: "none", boxShadow: "none" }}
          onFocus={handleFocus}
          onBlur={handleBlur}
          disabled={disabled}
          {...props}
        />
        {suffix && <span className="flex-shrink-0 text-muted-foreground">{suffix}</span>}
      </div>
    );
  }
);

DateTimeInput.displayName = "DateTimeInput";
