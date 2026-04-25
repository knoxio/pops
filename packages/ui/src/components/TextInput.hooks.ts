import { useState } from 'react';

export interface UseTextInputArgs {
  controlledValue: React.InputHTMLAttributes<HTMLInputElement>['value'];
  defaultValue: React.InputHTMLAttributes<HTMLInputElement>['defaultValue'];
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onClear?: () => void;
}

/**
 * State + handlers for {@link TextInput}.
 *
 * Operates in two modes:
 * - **Controlled**: when `controlledValue !== undefined` the parent owns the
 *   value. The hook simply forwards onChange and surfaces the controlled value.
 * - **Uncontrolled**: when no controlled value is supplied, the input is
 *   rendered without a `value` prop (using `defaultValue` only). The hook keeps
 *   internal state purely to drive UI affordances such as the clear button
 *   visibility — it does NOT push that state back into the input. This is
 *   important so that ref-based libraries (e.g. react-hook-form's `register()`,
 *   which writes via `inputRef.current.value` on `form.reset()`) can update the
 *   DOM without React clobbering the value on the next render.
 */
export function useTextInput({
  controlledValue,
  defaultValue,
  onChange,
  onClear,
}: UseTextInputArgs) {
  const [internalValue, setInternalValue] = useState(defaultValue ?? '');
  const [isFocused, setIsFocused] = useState(false);
  const isControlled = controlledValue !== undefined;
  const value = isControlled ? controlledValue : internalValue;
  const hasValue = Boolean(value && String(value).length > 0);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!isControlled) setInternalValue(e.target.value);
    onChange?.(e);
  };

  /**
   * Clear handler used in controlled mode. In uncontrolled mode the consumer
   * should clear the DOM value imperatively and dispatch a native input event
   * so downstream listeners (e.g. RHF) observe the change.
   */
  const handleClear = () => {
    if (!isControlled) setInternalValue('');
    onClear?.();
    const synthetic = { target: { value: '' } } as React.ChangeEvent<HTMLInputElement>;
    onChange?.(synthetic);
  };

  return {
    value,
    hasValue,
    isFocused,
    setIsFocused,
    handleChange,
    handleClear,
    isControlled,
    defaultValue,
    setInternalValue,
  };
}
