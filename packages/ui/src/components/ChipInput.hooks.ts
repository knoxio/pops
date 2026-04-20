import { type ClipboardEvent, type KeyboardEvent, useRef, useState } from 'react';

export interface UseChipInputArgs {
  controlledValue?: string[];
  defaultValue: string[];
  onChange?: (values: string[]) => void;
  onValidate?: (value: string) => boolean;
  delimiters: string[];
  allowDuplicates: boolean;
}

interface ChipInputState {
  values: string[];
  inputValue: string;
  setInputValue: (v: string) => void;
  isFocused: boolean;
  setIsFocused: (v: boolean) => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
  setValues: (next: string[]) => void;
}

function useChipInputState(
  controlledValue: string[] | undefined,
  defaultValue: string[],
  onChange: ((v: string[]) => void) | undefined
): ChipInputState {
  const [internalValues, setInternalValues] = useState<string[]>(defaultValue);
  const [inputValue, setInputValue] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const isControlled = controlledValue !== undefined;
  const values = isControlled ? controlledValue : internalValues;

  const setValues = (next: string[]) => {
    if (!isControlled) setInternalValues(next);
    onChange?.(next);
  };

  return { values, inputValue, setInputValue, isFocused, setIsFocused, inputRef, setValues };
}

export function useChipInput({
  controlledValue,
  defaultValue,
  onChange,
  onValidate,
  delimiters,
  allowDuplicates,
}: UseChipInputArgs) {
  const state = useChipInputState(controlledValue, defaultValue, onChange);
  const { values, inputValue, setInputValue, setValues } = state;

  const addChip = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    if (onValidate && !onValidate(trimmed)) return;
    if (!allowDuplicates && values.includes(trimmed)) return;
    setValues([...values, trimmed]);
    setInputValue('');
  };

  const removeChip = (index: number) => setValues(values.filter((_, i) => i !== index));

  const splitAndAdd = (text: string) => {
    text
      .split(/[,\n]/)
      .map((s) => s.trim())
      .filter(Boolean)
      .forEach(addChip);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    const { key } = e;
    if (delimiters.includes(key)) {
      e.preventDefault();
      if (inputValue) addChip(inputValue);
      return;
    }
    if (key === ',' && inputValue.includes(',')) {
      e.preventDefault();
      splitAndAdd(inputValue);
      return;
    }
    if (key === 'Backspace' && !inputValue && values.length > 0) {
      e.preventDefault();
      removeChip(values.length - 1);
    }
  };

  const handleBlur = () => {
    state.setIsFocused(false);
    if (inputValue.trim()) addChip(inputValue);
  };

  const handlePaste = (e: ClipboardEvent<HTMLInputElement>) => {
    const pastedText = e.clipboardData.getData('text');
    if (pastedText.includes(',') || pastedText.includes('\n')) {
      e.preventDefault();
      splitAndAdd(pastedText);
    }
  };

  return { ...state, addChip, removeChip, handleKeyDown, handleBlur, handlePaste };
}
