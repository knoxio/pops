/**
 * NumberInput component with stepper arrows and drag to change
 * Extends TextInput with number-specific functionality
 */
import { cva, type VariantProps } from 'class-variance-authority';
import {
  forwardRef,
  type InputHTMLAttributes,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from 'react';

import { cn } from '../lib/utils';

const containerVariants = cva(
  'flex items-center gap-2 w-full bg-background text-foreground transition-all outline-0 focus:outline-0 focus-visible:outline-0 focus-within:outline-0 ring-0 focus:ring-0 focus-visible:ring-0 focus-within:ring-0',
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
    compoundVariants: [
      {
        variant: 'underline',
        shape: ['default', 'pill'],
        class: 'rounded-none',
      },
    ],
    defaultVariants: {
      variant: 'default',
      size: 'default',
      shape: 'default',
    },
  }
);

const inputVariants = cva(
  'flex-1 bg-transparent border-0 outline-0 shadow-none focus:outline-0 focus:ring-0 focus:shadow-none focus-visible:outline-0 focus-visible:ring-0 placeholder:text-muted-foreground disabled:cursor-not-allowed',
  {
    variants: {
      size: {
        sm: 'text-xs',
        default: 'text-sm',
        lg: 'text-base',
      },
      centered: {
        true: 'text-center',
        false: '',
      },
    },
    defaultVariants: {
      size: 'default',
      centered: true,
    },
  }
);

export interface NumberInputProps
  extends
    Omit<InputHTMLAttributes<HTMLInputElement>, 'size' | 'prefix' | 'type'>,
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
   * Minimum value
   */
  min?: number;
  /**
   * Maximum value
   */
  max?: number;
  /**
   * Step for increment/decrement
   */
  step?: number;
  /**
   * Whether to show stepper arrows
   */
  showSteppers?: boolean;
  /**
   * Whether to enable drag to change value
   */
  enableDrag?: boolean;
  /**
   * Whether to center the text
   */
  centered?: boolean;
  /**
   * Container class name
   */
  containerClassName?: string;
}

/**
 * NumberInput component
 *
 * @example
 * ```tsx
 * <NumberInput min={0} max={100} step={1} />
 * <NumberInput showSteppers enableDrag />
 * ```
 */
export const NumberInput = forwardRef<HTMLInputElement, NumberInputProps>(
  (
    {
      className,
      containerClassName,
      variant,
      size,
      shape,
      prefix,
      suffix,
      min,
      max,
      step = 1,
      showSteppers = true,
      enableDrag = true,
      centered = true,
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
    const [internalValue, setInternalValue] = useState<number>(Number(defaultValue) || 0);
    const [isFocused, setIsFocused] = useState(false);
    const [isDragging, setIsDragging] = useState(false);
    const dragStartY = useRef<number>(0);
    const dragStartValue = useRef<number>(0);
    const isControlled = controlledValue !== undefined;
    const value = isControlled ? Number(controlledValue) : internalValue;

    const clampValue = (val: number): number => {
      if (min !== undefined && val < min) return min;
      if (max !== undefined && val > max) return max;
      return val;
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const newValue = Number(e.target.value);
      if (!isNaN(newValue)) {
        const clamped = clampValue(newValue);
        if (!isControlled) {
          setInternalValue(clamped);
        }
        onChange?.(e);
      }
    };

    const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
      setIsFocused(true);
      onFocus?.(e);
    };

    const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
      setIsFocused(false);
      onBlur?.(e);
    };

    const increment = () => {
      const newValue = clampValue(value + step);
      if (!isControlled) {
        setInternalValue(newValue);
      }
      const syntheticEvent = {
        target: { value: String(newValue) },
      } as React.ChangeEvent<HTMLInputElement>;
      onChange?.(syntheticEvent);
    };

    const decrement = () => {
      const newValue = clampValue(value - step);
      if (!isControlled) {
        setInternalValue(newValue);
      }
      const syntheticEvent = {
        target: { value: String(newValue) },
      } as React.ChangeEvent<HTMLInputElement>;
      onChange?.(syntheticEvent);
    };

    const handleMouseDown = (e: React.MouseEvent) => {
      if (!enableDrag || disabled) return;
      e.preventDefault();
      setIsDragging(true);
      dragStartY.current = e.clientY;
      dragStartValue.current = value;
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      const deltaY = dragStartY.current - e.clientY;
      const deltaValue = Math.round(deltaY / 2) * step;
      const newValue = clampValue(dragStartValue.current + deltaValue);

      if (!isControlled) {
        setInternalValue(newValue);
      }
      const syntheticEvent = {
        target: { value: String(newValue) },
      } as React.ChangeEvent<HTMLInputElement>;
      onChange?.(syntheticEvent);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    // Add/remove mouse move listeners
    useEffect(() => {
      if (isDragging) {
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
        return () => {
          document.removeEventListener('mousemove', handleMouseMove);
          document.removeEventListener('mouseup', handleMouseUp);
        };
      }
      return undefined;
    }, [isDragging]);

    return (
      <div
        className={cn(
          containerVariants({
            variant,
            size,
            shape,
          }),
          disabled && 'opacity-50 cursor-not-allowed',
          enableDrag && !disabled && 'cursor-ns-resize select-none',
          containerClassName
        )}
        style={isFocused ? { borderColor: 'var(--ring)' } : undefined}
        onMouseDown={handleMouseDown}
      >
        {prefix && <span className="flex-shrink-0 text-muted-foreground">{prefix}</span>}
        {showSteppers && (
          <button
            type="button"
            onClick={decrement}
            disabled={disabled || (min !== undefined && value <= min)}
            className="flex-shrink-0 text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed transition-colors p-2 min-w-11 min-h-11 inline-flex items-center justify-center"
            tabIndex={-1}
          >
            <ChevronDownIcon />
          </button>
        )}
        <input
          ref={ref}
          type="number"
          className={cn(inputVariants({ size, centered, className }))}
          style={{ outline: 'none', boxShadow: 'none' }}
          value={value}
          onChange={handleChange}
          onFocus={handleFocus}
          onBlur={handleBlur}
          disabled={disabled}
          min={min}
          max={max}
          step={step}
          {...props}
        />
        {showSteppers && (
          <button
            type="button"
            onClick={increment}
            disabled={disabled || (max !== undefined && value >= max)}
            className="flex-shrink-0 text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed transition-colors p-2 min-w-11 min-h-11 inline-flex items-center justify-center"
            tabIndex={-1}
          >
            <ChevronUpIcon />
          </button>
        )}
        {suffix && <span className="flex-shrink-0 text-muted-foreground">{suffix}</span>}
      </div>
    );
  }
);

NumberInput.displayName = 'NumberInput';

function ChevronUpIcon() {
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
    >
      <polyline points="18 15 12 9 6 15" />
    </svg>
  );
}

function ChevronDownIcon() {
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
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}
