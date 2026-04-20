/**
 * EditableCell component - Editable table cell with different field types
 * Supports text, number, date, select, and custom editors
 */
import { Check, Pencil, X } from 'lucide-react';

import { cn } from '../lib/utils';
import { DateEditor, NumberEditor, SelectEditor, TextEditor } from './EditableCell.editors';
import { useEditableCell } from './EditableCell.hook';
import { type SelectOption } from './Select';

export type CellType = 'text' | 'number' | 'date' | 'select' | 'custom';

export interface EditableCellProps<T = unknown> {
  value: T;
  onSave: (value: T) => void | Promise<void>;
  type?: CellType;
  options?: SelectOption[];
  customEditor?: React.ComponentType<{
    value: T;
    onChange: (value: T) => void;
    onSave: () => void;
    onCancel: () => void;
  }>;
  customDisplay?: React.ComponentType<{ value: T }>;
  editable?: boolean;
  placeholder?: string;
  formatDisplay?: (value: T) => string;
  validate?: (value: T) => boolean | string;
  className?: string;
}

interface DisplayCellProps<T> {
  value: T;
  editable: boolean;
  placeholder?: string;
  formatDisplay?: (v: T) => string;
  CustomDisplay?: React.ComponentType<{ value: T }>;
  className?: string;
  onEdit: () => void;
}

function DisplayCell<T>({
  value,
  editable,
  placeholder,
  formatDisplay,
  CustomDisplay,
  className,
  onEdit,
}: DisplayCellProps<T>) {
  const displayValue = formatDisplay ? formatDisplay(value) : String(value ?? '');
  return (
    <div
      className={cn(
        'group flex items-center gap-2 min-h-8',
        editable && 'cursor-pointer hover:bg-accent/50 rounded px-2 -mx-2',
        className
      )}
      onClick={() => editable && onEdit()}
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

const EDITOR_MAP = {
  text: TextEditor,
  number: NumberEditor,
  date: DateEditor,
  select: SelectEditor,
} as const;

interface EditorActionsProps {
  saving: boolean;
  onSave: () => void;
  onCancel: () => void;
}

function EditorActions({ saving, onSave, onCancel }: EditorActionsProps) {
  return (
    <div className="flex gap-1">
      <button
        onClick={onSave}
        disabled={saving}
        className="p-1 rounded hover:bg-accent disabled:opacity-50"
        title="Save"
      >
        <Check className="h-4 w-4 text-success" />
      </button>
      <button
        onClick={onCancel}
        disabled={saving}
        className="p-1 rounded hover:bg-accent disabled:opacity-50"
        title="Cancel"
      >
        <X className="h-4 w-4 text-destructive" />
      </button>
    </div>
  );
}

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
  const cell = useEditableCell({ initialValue, onSave, validate });

  if (!cell.isEditing) {
    return (
      <DisplayCell
        value={cell.value}
        editable={editable}
        placeholder={placeholder}
        formatDisplay={formatDisplay}
        CustomDisplay={CustomDisplay}
        className={className}
        onEdit={() => cell.setIsEditing(true)}
      />
    );
  }

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div className="flex-1">
        <ActiveEditor
          type={type}
          value={cell.value}
          setValue={cell.setValue}
          onSave={cell.handleSave}
          onCancel={cell.handleCancel}
          onKeyDown={cell.handleKeyDown}
          placeholder={placeholder}
          saving={cell.saving}
          options={options}
          inputRef={cell.inputRef}
          CustomEditor={CustomEditor}
        />
        {cell.error && <p className="text-xs text-destructive mt-1">{cell.error}</p>}
      </div>
      <EditorActions saving={cell.saving} onSave={cell.handleSave} onCancel={cell.handleCancel} />
    </div>
  );
}

interface ActiveEditorProps<T> {
  type: CellType;
  value: T;
  setValue: (v: T) => void;
  onSave: () => void;
  onCancel: () => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  placeholder?: string;
  saving: boolean;
  options: SelectOption[];
  inputRef: React.RefObject<HTMLInputElement | null>;
  CustomEditor?: React.ComponentType<{
    value: T;
    onChange: (value: T) => void;
    onSave: () => void;
    onCancel: () => void;
  }>;
}

function ActiveEditor<T>({
  type,
  value,
  setValue,
  onSave,
  onCancel,
  onKeyDown,
  placeholder,
  saving,
  options,
  inputRef,
  CustomEditor,
}: ActiveEditorProps<T>) {
  if (CustomEditor) {
    return <CustomEditor value={value} onChange={setValue} onSave={onSave} onCancel={onCancel} />;
  }
  if (type === 'custom') return null;
  const Editor = EDITOR_MAP[type];
  return (
    <Editor
      value={value}
      setValue={setValue}
      onKeyDown={onKeyDown}
      placeholder={placeholder}
      saving={saving}
      options={options}
      inputRef={inputRef}
    />
  );
}
