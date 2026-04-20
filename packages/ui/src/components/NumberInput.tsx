/**
 * NumberInput component with stepper arrows and drag to change
 * Extends TextInput with number-specific functionality
 */
import { type VariantProps } from 'class-variance-authority';
import { forwardRef, type InputHTMLAttributes, type ReactNode } from 'react';

import { cn } from '../lib/utils';
import { useNumberInput } from './NumberInput.hooks';
import { containerVariants, inputVariants } from './NumberInput.variants';

export interface NumberInputProps
  extends
    Omit<InputHTMLAttributes<HTMLInputElement>, 'size' | 'prefix' | 'type'>,
    VariantProps<typeof containerVariants> {
  prefix?: ReactNode;
  suffix?: ReactNode;
  min?: number;
  max?: number;
  step?: number;
  showSteppers?: boolean;
  enableDrag?: boolean;
  centered?: boolean;
  containerClassName?: string;
}

interface StepperButtonProps {
  direction: 'up' | 'down';
  onClick: () => void;
  disabled?: boolean;
}

function StepperButton({ direction, onClick, disabled }: StepperButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex-shrink-0 text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed transition-colors p-2 min-w-11 min-h-11 inline-flex items-center justify-center"
      tabIndex={-1}
    >
      {direction === 'up' ? <ChevronUpIcon /> : <ChevronDownIcon />}
    </button>
  );
}

interface NumberInputBodyProps {
  ni: ReturnType<typeof useNumberInput>;
  prefix?: ReactNode;
  suffix?: ReactNode;
  showSteppers: boolean;
  inputProps: React.InputHTMLAttributes<HTMLInputElement>;
  inputRef: React.Ref<HTMLInputElement>;
  size: NumberInputProps['size'];
  centered?: boolean;
  className?: string;
  onFocus?: (e: React.FocusEvent<HTMLInputElement>) => void;
  onBlur?: (e: React.FocusEvent<HTMLInputElement>) => void;
}

function NumberInputBody({
  ni,
  prefix,
  suffix,
  showSteppers,
  inputProps,
  inputRef,
  size,
  centered,
  className,
  onFocus,
  onBlur,
}: NumberInputBodyProps) {
  return (
    <>
      {prefix && <span className="flex-shrink-0 text-muted-foreground">{prefix}</span>}
      {showSteppers && (
        <StepperButton direction="down" onClick={ni.decrement} disabled={ni.decrementDisabled} />
      )}
      <input
        ref={inputRef}
        type="number"
        className={cn(inputVariants({ size, centered, className }))}
        value={ni.value}
        onChange={ni.handleChange}
        onFocus={(e) => {
          ni.setIsFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          ni.setIsFocused(false);
          onBlur?.(e);
        }}
        {...inputProps}
      />
      {showSteppers && (
        <StepperButton direction="up" onClick={ni.increment} disabled={ni.incrementDisabled} />
      )}
      {suffix && <span className="flex-shrink-0 text-muted-foreground">{suffix}</span>}
    </>
  );
}

export const NumberInput = forwardRef<HTMLInputElement, NumberInputProps>((props, ref) => {
  const {
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
    ...inputAttrs
  } = props;
  const ni = useNumberInput({
    controlledValue,
    defaultValue,
    min,
    max,
    step,
    enableDrag,
    disabled,
    onChange,
  });

  return (
    <div
      className={cn(
        containerVariants({ variant, size, shape }),
        disabled && 'opacity-50 cursor-not-allowed',
        enableDrag && !disabled && 'cursor-ns-resize select-none',
        containerClassName
      )}
      style={ni.isFocused ? { borderColor: 'var(--ring)' } : undefined}
      onMouseDown={ni.handleMouseDown}
    >
      <NumberInputBody
        ni={ni}
        prefix={prefix}
        suffix={suffix}
        showSteppers={showSteppers}
        inputProps={{ disabled, min, max, step, ...inputAttrs }}
        inputRef={ref}
        size={size}
        centered={centered}
        className={className}
        onFocus={onFocus}
        onBlur={onBlur}
      />
    </div>
  );
});

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
