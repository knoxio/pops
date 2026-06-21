import { useEffect, useRef, useState } from 'react';

interface InlineInputProps {
  defaultValue?: string;
  onSave: (value: string) => void;
  onCancel: () => void;
  placeholder?: string;
}

export function InlineInput({ defaultValue, onSave, onCancel, placeholder }: InlineInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState(defaultValue ?? '');

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'Enter') {
      const trimmed = value.trim();
      if (trimmed) onSave(trimmed);
    } else if (e.key === 'Escape') {
      onCancel();
    }
  };

  return (
    <input
      ref={inputRef}
      type="text"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={handleKeyDown}
      onBlur={onCancel}
      placeholder={placeholder}
      className="text-sm font-medium bg-transparent border-b border-app-accent outline-none px-0.5 py-0 w-full max-w-50"
    />
  );
}
