/**
 * RadioInput component - Radio group with labels using shadcn primitives
 * Built on @radix-ui/react-radio-group
 */
import { forwardRef } from "react";
import { cn } from "../lib/utils";
import { RadioGroup, RadioGroupItem } from "../primitives/radio-group";

export interface RadioOption {
  label: string;
  value: string;
  description?: string;
  disabled?: boolean;
}

export interface RadioInputProps {
  /**
   * Radio group name
   */
  name?: string;
  /**
   * Radio options
   */
  options: RadioOption[];
  /**
   * Selected value
   */
  value?: string;
  /**
   * Default value (uncontrolled)
   */
  defaultValue?: string;
  /**
   * Callback when value changes
   */
  onValueChange?: (value: string) => void;
  /**
   * Group label
   */
  label?: string;
  /**
   * Group description
   */
  description?: string;
  /**
   * Disabled state
   */
  disabled?: boolean;
  /**
   * Required field
   */
  required?: boolean;
  /**
   * Error state
   */
  error?: boolean;
  /**
   * Error message
   */
  errorMessage?: string;
  /**
   * Layout orientation
   */
  orientation?: "vertical" | "horizontal";
  /**
   * Container className
   */
  className?: string;
}

/**
 * RadioInput component
 *
 * @example
 * ```tsx
 * <RadioInput
 *   label="Select a plan"
 *   options={[
 *     { label: "Free", value: "free", description: "Basic features" },
 *     { label: "Pro", value: "pro", description: "All features" }
 *   ]}
 *   value={plan}
 *   onValueChange={setPlan}
 * />
 * ```
 */
export const RadioInput = forwardRef<HTMLDivElement, RadioInputProps>(
  (
    {
      name,
      options,
      value,
      defaultValue,
      onValueChange,
      label,
      description,
      disabled = false,
      required = false,
      error = false,
      errorMessage,
      orientation = "vertical",
      className,
      ...props
    },
    ref
  ) => {
    return (
      <div className={cn("flex flex-col gap-3", className)} ref={ref}>
        {(label || description) && (
          <div className="flex flex-col gap-1">
            {label && (
              <label className="text-sm font-medium">
                {label}
                {required && <span className="text-destructive ml-1">*</span>}
              </label>
            )}
            {description && (
              <p className="text-sm text-muted-foreground">{description}</p>
            )}
          </div>
        )}
        <RadioGroup
          name={name}
          value={value}
          defaultValue={defaultValue}
          onValueChange={onValueChange}
          disabled={disabled}
          required={required}
          aria-invalid={error}
          className={cn(
            orientation === "horizontal"
              ? "grid gap-3 sm:flex sm:flex-row sm:gap-4"
              : "grid gap-3"
          )}
          {...props}
        >
          {options.map((option) => (
            <div key={option.value} className="flex items-start gap-2">
              <RadioGroupItem
                value={option.value}
                id={`radio-${option.value}`}
                disabled={option.disabled || disabled}
                className="mt-0.5"
              />
              <div className="flex flex-col gap-0.5">
                <label
                  htmlFor={`radio-${option.value}`}
                  className={cn(
                    "text-sm font-medium leading-none cursor-pointer select-none",
                    (option.disabled || disabled) &&
                      "opacity-50 cursor-not-allowed"
                  )}
                >
                  {option.label}
                </label>
                {option.description && (
                  <p className="text-sm text-muted-foreground">
                    {option.description}
                  </p>
                )}
              </div>
            </div>
          ))}
        </RadioGroup>
        {error && errorMessage && (
          <p className="text-sm text-destructive">{errorMessage}</p>
        )}
      </div>
    );
  }
);

RadioInput.displayName = "RadioInput";
