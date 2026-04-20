import { useEffect, useRef, useState } from 'react';

export interface UseEditableCellArgs<T> {
  initialValue: T;
  onSave: (value: T) => void | Promise<void>;
  validate?: (value: T) => boolean | string;
}

export function useEditableCell<T>({ initialValue, onSave, validate }: UseEditableCellArgs<T>) {
  const [isEditing, setIsEditing] = useState(false);
  const [value, setValue] = useState<T>(initialValue);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => setValue(initialValue), [initialValue]);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleSave = async () => {
    if (validate) {
      const result = validate(value);
      if (result !== true) {
        setError(typeof result === 'string' ? result : 'Invalid value');
        return;
      }
    }
    setError(null);
    setSaving(true);
    try {
      await onSave(value);
      setIsEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setValue(initialValue);
    setError(null);
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSave();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      handleCancel();
    }
  };

  return {
    isEditing,
    setIsEditing,
    value,
    setValue,
    error,
    saving,
    inputRef,
    handleSave,
    handleCancel,
    handleKeyDown,
  };
}
