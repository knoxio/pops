import { useState } from 'react';

export interface UseTextInputArgs {
  controlledValue: React.InputHTMLAttributes<HTMLInputElement>['value'];
  defaultValue: React.InputHTMLAttributes<HTMLInputElement>['defaultValue'];
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onClear?: () => void;
}

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

  const handleClear = () => {
    if (!isControlled) setInternalValue('');
    onClear?.();
    const synthetic = { target: { value: '' } } as React.ChangeEvent<HTMLInputElement>;
    onChange?.(synthetic);
  };

  return { value, hasValue, isFocused, setIsFocused, handleChange, handleClear };
}
