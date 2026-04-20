import { Input, Label } from '@pops/ui';

import type { ProcessedTransaction } from '@pops/api/modules/finance/imports';

interface FieldProps {
  editedFields: Partial<ProcessedTransaction>;
  setEditedFields: React.Dispatch<React.SetStateAction<Partial<ProcessedTransaction>>>;
}

function TextField({
  id,
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
  step,
  autoFocus,
}: {
  id: string;
  label: string;
  value: string | number;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  step?: string;
  autoFocus?: boolean;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type={type}
        step={step}
        autoFocus={autoFocus}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="bg-white dark:bg-gray-800"
      />
    </div>
  );
}

export function EditableFormFields({ editedFields, setEditedFields }: FieldProps) {
  const update = (key: keyof ProcessedTransaction, value: unknown) =>
    setEditedFields({ ...editedFields, [key]: value });
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
      <TextField
        id="description"
        label="Description"
        autoFocus
        value={editedFields.description ?? ''}
        onChange={(v) => update('description', v)}
      />
      <TextField
        id="amount"
        label="Amount"
        type="number"
        step="0.01"
        value={editedFields.amount ?? 0}
        onChange={(v) => update('amount', parseFloat(v))}
      />
      <TextField
        id="date"
        label="Date"
        type="date"
        value={editedFields.date ?? ''}
        onChange={(v) => update('date', v)}
      />
      <TextField
        id="account"
        label="Account"
        value={editedFields.account ?? ''}
        onChange={(v) => update('account', v)}
      />
      <TextField
        id="location"
        label="Location"
        value={editedFields.location ?? ''}
        placeholder="Optional"
        onChange={(v) => update('location', v)}
      />
    </div>
  );
}
