/**
 * ChipInput component for multi-value input like email tags
 * Similar to Gmail's "To" field where entries become chips
 */
import { cva, type VariantProps } from 'class-variance-authority';
import { forwardRef, type InputHTMLAttributes, type KeyboardEvent, useRef, useState } from 'react';

import { cn } from '../lib/utils';
import { Chip } from './Chip';

const containerVariants = cva(
  'flex flex-wrap items-center gap-2 w-full bg-background text-foreground transition-all outline-0 focus-within:outline-0 ring-0 focus-within:ring-0 p-2 min-h-11',
  {
    variants: {
      variant: {
        default: 'border border-border',
        ghost: 'border-0 hover:bg-accent',
        underline: 'border-0 border-b border-border rounded-none',
      },
      shape: {
        default: 'rounded-md',
        pill: 'rounded-full',
      },
    },
    compoundVariants: [
      {
        variant: 'underline',
        shape: 'pill',
        class: 'rounded-none',
      },
    ],
    defaultVariants: {
      variant: 'default',
      shape: 'default',
    },
  }
);

const inputVariants = cva(
  'flex-1 bg-transparent border-0 outline-0 shadow-none focus:outline-0 focus:ring-0 focus:shadow-none focus-visible:outline-0 focus-visible:ring-0 placeholder:text-muted-foreground disabled:cursor-not-allowed min-w-30',
  {
    variants: {
      size: {
        sm: 'text-xs',
        default: 'text-sm',
        lg: 'text-base',
      },
    },
    defaultVariants: {
      size: 'default',
    },
  }
);

export interface ChipInputProps
  extends
    Omit<InputHTMLAttributes<HTMLInputElement>, 'size' | 'value' | 'onChange'>,
    VariantProps<typeof containerVariants> {
  /**
   * Array of chip values
   */
  value?: string[];
  /**
   * Default values (uncontrolled)
   */
  defaultValue?: string[];
  /**
   * Callback when chips change
   */
  onChange?: (values: string[]) => void;
  /**
   * Callback to validate a value before adding
   */
  onValidate?: (value: string) => boolean;
  /**
   * Keys that trigger chip creation (default: Enter, comma, Tab)
   */
  delimiters?: string[];
  /**
   * Allow duplicates
   */
  allowDuplicates?: boolean;
  /**
   * Chip variant
   */
  chipVariant?: 'default' | 'primary' | 'success';
  /**
   * Container className
   */
  containerClassName?: string;
}

/**
 * ChipInput component
 *
 * @example
 * ```tsx
 * <ChipInput placeholder="Add emails..." />
 * <ChipInput value={emails} onChange={setEmails} />
 * ```
 */
export const ChipInput = forwardRef<HTMLInputElement, ChipInputProps>(
  (
    {
      className,
      containerClassName,
      variant,
      shape,
      value: controlledValue,
      defaultValue = [],
      onChange,
      onValidate,
      delimiters = ['Enter', ',', 'Tab'],
      allowDuplicates = false,
      chipVariant = 'default',
      placeholder,
      disabled,
      ...props
    },
    ref
  ) => {
    const [internalValues, setInternalValues] = useState<string[]>(defaultValue);
    const [inputValue, setInputValue] = useState('');
    const [isFocused, setIsFocused] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);
    const isControlled = controlledValue !== undefined;
    const values = isControlled ? controlledValue : internalValues;

    const addChip = (value: string) => {
      const trimmed = value.trim();
      if (!trimmed) return;

      // Validate
      if (onValidate && !onValidate(trimmed)) return;

      // Check duplicates
      if (!allowDuplicates && values.includes(trimmed)) return;

      const newValues = [...values, trimmed];
      if (!isControlled) {
        setInternalValues(newValues);
      }
      onChange?.(newValues);
      setInputValue('');
    };

    const removeChip = (index: number) => {
      const newValues = values.filter((_, i) => i !== index);
      if (!isControlled) {
        setInternalValues(newValues);
      }
      onChange?.(newValues);
    };

    const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
      const { key } = e;

      // Add chip on delimiter
      if (delimiters.includes(key)) {
        e.preventDefault();
        if (inputValue) {
          addChip(inputValue);
        }
        return;
      }

      // Handle comma in value
      if (key === ',' && inputValue.includes(',')) {
        e.preventDefault();
        const parts = inputValue.split(',');
        parts.forEach((part) => addChip(part));
        return;
      }

      // Remove last chip on backspace
      if (key === 'Backspace' && !inputValue && values.length > 0) {
        e.preventDefault();
        removeChip(values.length - 1);
      }
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      setInputValue(e.target.value);
    };

    const handleContainerClick = () => {
      inputRef.current?.focus();
    };

    const handleBlur = () => {
      setIsFocused(false);
      // Add chip on blur if there's a value
      if (inputValue.trim()) {
        addChip(inputValue);
      }
    };

    const handleFocus = () => {
      setIsFocused(true);
    };

    const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
      const pastedText = e.clipboardData.getData('text');
      if (pastedText.includes(',') || pastedText.includes('\n')) {
        e.preventDefault();
        const parts = pastedText
          .split(/[,\n]/)
          .map((s) => s.trim())
          .filter(Boolean);
        parts.forEach((part) => addChip(part));
      }
    };

    return (
      <div
        className={cn(
          containerVariants({
            variant,
            shape,
          }),
          disabled && 'opacity-50 cursor-not-allowed',
          containerClassName
        )}
        style={isFocused ? { borderColor: 'var(--ring)' } : undefined}
        onClick={handleContainerClick}
      >
        {values.map((value, index) => (
          <Chip
            key={`${value}-${index}`}
            variant={chipVariant}
            size="sm"
            removable
            onRemove={() => removeChip(index)}
          >
            {value}
          </Chip>
        ))}
        <input
          ref={(node) => {
            if (typeof ref === 'function') {
              ref(node);
            } else if (ref) {
              ref.current = node;
            }
            inputRef.current = node;
          }}
          type="text"
          className={cn(inputVariants({ className }))}
          style={{ outline: 'none', boxShadow: 'none' }}
          value={inputValue}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={handleFocus}
          onBlur={handleBlur}
          onPaste={handlePaste}
          disabled={disabled}
          placeholder={values.length === 0 ? placeholder : undefined}
          {...props}
        />
      </div>
    );
  }
);

ChipInput.displayName = 'ChipInput';
