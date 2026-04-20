import { DateTimeInput } from './DateTimeInput';
import { NumberInput } from './NumberInput';
import { Select, type SelectOption } from './Select';
import { TextInput } from './TextInput';

import type { RefObject } from 'react';

export interface EditorProps<T> {
  value: T;
  setValue: (v: T) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  placeholder?: string;
  saving: boolean;
  options: SelectOption[];
  inputRef: RefObject<HTMLInputElement | null>;
}

export function TextEditor<T>({
  value,
  setValue,
  onKeyDown,
  placeholder,
  saving,
  inputRef,
}: EditorProps<T>) {
  return (
    <TextInput
      ref={inputRef}
      value={value as string}
      onChange={(e) => setValue(e.target.value as T)}
      onKeyDown={onKeyDown}
      placeholder={placeholder}
      className="h-8"
      disabled={saving}
    />
  );
}

export function NumberEditor<T>({
  value,
  setValue,
  onKeyDown,
  placeholder,
  saving,
  inputRef,
}: EditorProps<T>) {
  return (
    <NumberInput
      ref={inputRef}
      value={value as number}
      onChange={(val) => setValue(val as T)}
      onKeyDown={onKeyDown}
      placeholder={placeholder}
      className="h-8"
      disabled={saving}
    />
  );
}

export function DateEditor<T>({ value, setValue, onKeyDown, placeholder, saving }: EditorProps<T>) {
  return (
    <DateTimeInput
      value={value as string}
      onChange={(val) => setValue(val as T)}
      onKeyDown={onKeyDown}
      placeholder={placeholder}
      className="h-8"
      disabled={saving}
    />
  );
}

export function SelectEditor<T>({ value, setValue, placeholder, saving, options }: EditorProps<T>) {
  return (
    <Select
      value={value as string}
      onChange={(e) => setValue(e.target.value as T)}
      options={options}
      placeholder={placeholder}
      className="h-8"
      disabled={saving}
    />
  );
}
