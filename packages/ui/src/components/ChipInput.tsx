/**
 * ChipInput component for multi-value input like email tags
 * Similar to Gmail's "To" field where entries become chips
 */
import { cva, type VariantProps } from 'class-variance-authority';
import { forwardRef, type InputHTMLAttributes } from 'react';

import { cn } from '../lib/utils';
import { Chip } from './Chip';
import { useChipInput } from './ChipInput.hooks';

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
    compoundVariants: [{ variant: 'underline', shape: 'pill', class: 'rounded-none' }],
    defaultVariants: { variant: 'default', shape: 'default' },
  }
);

const inputVariants = cva(
  'flex-1 bg-transparent border-0 outline-0 shadow-none focus:outline-0 focus:ring-0 focus:shadow-none focus-visible:outline-0 focus-visible:ring-0 placeholder:text-muted-foreground disabled:cursor-not-allowed min-w-30',
  {
    variants: {
      size: { sm: 'text-xs', default: 'text-sm', lg: 'text-base' },
    },
    defaultVariants: { size: 'default' },
  }
);

export interface ChipInputProps
  extends
    Omit<InputHTMLAttributes<HTMLInputElement>, 'size' | 'value' | 'onChange'>,
    VariantProps<typeof containerVariants> {
  value?: string[];
  defaultValue?: string[];
  onChange?: (values: string[]) => void;
  onValidate?: (value: string) => boolean;
  delimiters?: string[];
  allowDuplicates?: boolean;
  chipVariant?: 'default' | 'primary' | 'success';
  containerClassName?: string;
}

function ChipList({
  values,
  chipVariant,
  onRemove,
}: {
  values: string[];
  chipVariant: 'default' | 'primary' | 'success';
  onRemove: (i: number) => void;
}) {
  return (
    <>
      {values.map((value, index) => (
        <Chip
          key={`${value}-${index}`}
          variant={chipVariant}
          size="sm"
          removable
          onRemove={() => onRemove(index)}
        >
          {value}
        </Chip>
      ))}
    </>
  );
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
    const chip = useChipInput({
      controlledValue,
      defaultValue,
      onChange,
      onValidate,
      delimiters,
      allowDuplicates,
    });

    const setRefs = (node: HTMLInputElement | null) => {
      if (typeof ref === 'function') ref(node);
      else if (ref) ref.current = node;
      chip.inputRef.current = node;
    };

    return (
      <div
        className={cn(
          containerVariants({ variant, shape }),
          disabled && 'opacity-50 cursor-not-allowed',
          containerClassName
        )}
        style={chip.isFocused ? { borderColor: 'var(--ring)' } : undefined}
        onClick={() => chip.inputRef.current?.focus()}
      >
        <ChipList values={chip.values} chipVariant={chipVariant} onRemove={chip.removeChip} />
        <input
          ref={setRefs}
          type="text"
          className={cn(inputVariants({ className }))}
          value={chip.inputValue}
          onChange={(e) => chip.setInputValue(e.target.value)}
          onKeyDown={chip.handleKeyDown}
          onFocus={() => chip.setIsFocused(true)}
          onBlur={chip.handleBlur}
          onPaste={chip.handlePaste}
          disabled={disabled}
          placeholder={chip.values.length === 0 ? placeholder : undefined}
          {...props}
        />
      </div>
    );
  }
);

ChipInput.displayName = 'ChipInput';
