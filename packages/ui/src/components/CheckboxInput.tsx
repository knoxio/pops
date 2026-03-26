/**
 * CheckboxInput component - Checkbox with label using shadcn primitives
 * Built on @radix-ui/react-checkbox
 */
import { forwardRef, type ReactNode } from "react";
import { cn } from "../lib/utils";
import { Checkbox } from "../primitives/checkbox";

export interface CheckboxInputProps {
  /**
   * Checkbox ID (links label to input)
   */
  id?: string;
  /**
   * Label text or element
   */
  label?: ReactNode;
  /**
   * Description text below label
   */
  description?: string;
  /**
   * Checked state
   */
  checked?: boolean;
  /**
   * Default checked (uncontrolled)
   */
  defaultChecked?: boolean;
  /**
   * Callback when checked state changes
   */
  onCheckedChange?: (checked: boolean) => void;
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
   * Container className
   */
  className?: string;
  /**
   * Label position
   */
  labelPosition?: "right" | "left";
}

/**
 * CheckboxInput component
 *
 * @example
 * ```tsx
 * <CheckboxInput
 *   label="Accept terms and conditions"
 *   checked={accepted}
 *   onCheckedChange={setAccepted}
 * />
 *
 * <CheckboxInput
 *   label="Subscribe to newsletter"
 *   description="Get weekly updates about new features"
 * />
 * ```
 */
export const CheckboxInput = forwardRef<HTMLButtonElement, CheckboxInputProps>(
  (
    {
      id,
      label,
      description,
      checked,
      defaultChecked,
      onCheckedChange,
      disabled = false,
      required = false,
      error = false,
      errorMessage,
      className,
      labelPosition = "right",
      ...props
    },
    ref
  ) => {
    const generatedId = id || `checkbox-${Math.random().toString(36).substr(2, 9)}`;

    return (
      <div className={cn("flex flex-col gap-2", className)}>
        <div
          className={cn(
            "flex items-start gap-2",
            labelPosition === "left" && "flex-row-reverse justify-end"
          )}
        >
          <Checkbox
            ref={ref}
            id={generatedId}
            checked={checked}
            defaultChecked={defaultChecked}
            onCheckedChange={onCheckedChange}
            disabled={disabled}
            required={required}
            aria-invalid={error}
            className="mt-0.5"
            {...props}
          />
          {label && (
            <div className="flex flex-col gap-0.5">
              <label
                htmlFor={generatedId}
                className={cn(
                  "text-sm font-medium leading-none cursor-pointer select-none",
                  disabled && "opacity-50 cursor-not-allowed"
                )}
              >
                {label}
                {required && <span className="text-destructive ml-1">*</span>}
              </label>
              {description && <p className="text-sm text-muted-foreground">{description}</p>}
            </div>
          )}
        </div>
        {error && errorMessage && <p className="text-sm text-destructive">{errorMessage}</p>}
      </div>
    );
  }
);

CheckboxInput.displayName = "CheckboxInput";
