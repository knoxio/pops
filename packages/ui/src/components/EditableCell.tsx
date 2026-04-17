/**
 * EditableCell component - Editable table cell with different field types
 * Supports text, number, date, select, and custom editors
 */
import { Check, Pencil, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { cn } from '../lib/utils';
import { DateTimeInput } from './DateTimeInput';
import { NumberInput } from './NumberInput';
import { Select, type SelectOption } from './Select';
import { TextInput } from './TextInput';

export type CellType = 'text' | 'number' | 'date' | 'select' | 'custom';

export interface EditableCellProps<T = unknown> {
  /**
   * Current value
   */
  value: T;
  /**
   * Callback when value is saved
   */
  onSave: (value: T) => void | Promise<void>;
  /**
   * Cell type
   */
  type?: CellType;
  /**
   * Options for select type
   */
  options?: SelectOption[];
  /**
   * Custom editor component
   */
  customEditor?: React.ComponentType<{
    value: T;
    onChange: (value: T) => void;
    onSave: () => void;
    onCancel: () => void;
  }>;
  /**
   * Custom display component
   */
  customDisplay?: React.ComponentType<{ value: T }>;
  /**
   * Whether cell is editable
   */
  editable?: boolean;
  /**
   * Placeholder text
   */
  placeholder?: string;
  /**
   * Format function for display
   */
  formatDisplay?: (value: T) => string;
  /**
   * Validate function
   */
  validate?: (value: T) => boolean | string;
  /**
   * Cell className
   */
  className?: string;
}

/**
 * EditableCell component
 *
 * @example
 * ```tsx
 * <EditableCell
 *   value={row.email}
 *   type="text"
 *   onSave={async (newValue) => {
 *     await updateUser(row.id, { email: newValue });
 *   }}
 * />
 *
 * <EditableCell
 *   value={row.status}
 *   type="select"
 *   options={[
 *     { label: "Active", value: "active" },
 *     { label: "Inactive", value: "inactive" }
 *   ]}
 *   onSave={(newValue) => updateStatus(row.id, newValue)}
 * />
 * ```
 */
export function EditableCell<T = unknown>({
  value: initialValue,
  onSave,
  type = 'text',
  options = [],
  customEditor: CustomEditor,
  customDisplay: CustomDisplay,
  editable = true,
  placeholder,
  formatDisplay,
  validate,
  className,
}: EditableCellProps<T>) {
  const [isEditing, setIsEditing] = useState(false);
  const [value, setValue] = useState<T>(initialValue);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync with external value changes
  useEffect(() => {
    setValue(initialValue);
  }, [initialValue]);

  // Focus input when entering edit mode
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleSave = async () => {
    // Validate
    if (validate) {
      const validationResult = validate(value);
      if (validationResult !== true) {
        setError(typeof validationResult === 'string' ? validationResult : 'Invalid value');
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

  // Display mode
  if (!isEditing) {
    const displayValue = formatDisplay ? formatDisplay(value) : String(value ?? '');

    return (
      <div
        className={cn(
          'group flex items-center gap-2 min-h-8',
          editable && 'cursor-pointer hover:bg-accent/50 rounded px-2 -mx-2',
          className
        )}
        onClick={() => editable && setIsEditing(true)}
      >
        {CustomDisplay ? (
          <CustomDisplay value={value} />
        ) : (
          <span className="flex-1">{displayValue || placeholder}</span>
        )}
        {editable && (
          <Pencil className="h-3 w-3 opacity-0 group-hover:opacity-50 transition-opacity" />
        )}
      </div>
    );
  }

  // Edit mode
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div className="flex-1">
        {CustomEditor ? (
          <CustomEditor
            value={value}
            onChange={setValue}
            onSave={handleSave}
            onCancel={handleCancel}
          />
        ) : type === 'text' ? (
          <TextInput
            ref={inputRef}
            value={value as string}
            onChange={(e) => {
              setValue(e.target.value as T);
            }}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            className="h-8"
            disabled={saving}
          />
        ) : type === 'number' ? (
          <NumberInput
            ref={inputRef}
            value={value as number}
            onChange={(val) => {
              setValue(val as T);
            }}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            className="h-8"
            disabled={saving}
          />
        ) : type === 'date' ? (
          <DateTimeInput
            value={value as string}
            onChange={(val) => {
              setValue(val as T);
            }}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            className="h-8"
            disabled={saving}
          />
        ) : type === 'select' ? (
          <Select
            value={value as string}
            onChange={(e) => {
              setValue(e.target.value as T);
            }}
            options={options}
            placeholder={placeholder}
            className="h-8"
            disabled={saving}
          />
        ) : null}
        {error && <p className="text-xs text-destructive mt-1">{error}</p>}
      </div>
      <div className="flex gap-1">
        <button
          onClick={handleSave}
          disabled={saving}
          className="p-1 rounded hover:bg-accent disabled:opacity-50"
          title="Save"
        >
          <Check className="h-4 w-4 text-success" />
        </button>
        <button
          onClick={handleCancel}
          disabled={saving}
          className="p-1 rounded hover:bg-accent disabled:opacity-50"
          title="Cancel"
        >
          <X className="h-4 w-4 text-destructive" />
        </button>
      </div>
    </div>
  );
}
