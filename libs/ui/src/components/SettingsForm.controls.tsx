import { Checkbox } from '../primitives/checkbox';
import { Input } from '../primitives/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../primitives/select';
import { Textarea } from '../primitives/textarea';
import { DurationFieldInput } from './DurationFieldInput';

import type { SettingsField, SettingsOption } from './SettingsForm.types';

function getNumberFieldValue(value: unknown): number | string {
  if (typeof value === 'number') return value;
  if (value === '') return '';
  return Number(value) || 0;
}

export interface ControlProps {
  field: SettingsField;
  value: unknown;
  fieldId: string;
  error: string | null | undefined;
  saving: boolean;
  loadedOptions: Record<string, SettingsOption[]>;
  update: (id: string, value: unknown) => void;
}

function TextControl({ field, value, fieldId, saving, error, update }: ControlProps) {
  return (
    <Input
      id={fieldId}
      disabled={saving}
      aria-invalid={!!error || undefined}
      type={field.kind === 'password' ? 'password' : 'text'}
      value={typeof value === 'string' ? value : ''}
      placeholder={field.placeholder}
      onChange={(e) => update(field.id, e.target.value)}
    />
  );
}

function NumberControl({ field, value, fieldId, saving, error, update }: ControlProps) {
  return (
    <Input
      id={fieldId}
      disabled={saving}
      aria-invalid={!!error || undefined}
      type="number"
      min={field.min}
      max={field.max}
      value={getNumberFieldValue(value)}
      placeholder={field.placeholder}
      onChange={(e) => update(field.id, e.target.value === '' ? '' : Number(e.target.value))}
    />
  );
}

function ToggleControl({ field, value, fieldId, saving, update }: ControlProps) {
  return (
    <Checkbox
      id={fieldId}
      disabled={saving}
      checked={!!value}
      onCheckedChange={(v) => update(field.id, v === true)}
    />
  );
}

function SelectControl({ field, value, fieldId, saving, loadedOptions, update }: ControlProps) {
  const opts = field.options ?? loadedOptions[field.id] ?? [];
  return (
    <Select
      value={typeof value === 'string' ? value : ''}
      onValueChange={(v) => update(field.id, v)}
      disabled={saving}
    >
      <SelectTrigger id={fieldId}>
        <SelectValue placeholder={field.placeholder} />
      </SelectTrigger>
      <SelectContent>
        {opts.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function TextAreaControl({ field, value, fieldId, saving, error, update }: ControlProps) {
  return (
    <Textarea
      id={fieldId}
      disabled={saving}
      aria-invalid={!!error || undefined}
      rows={field.kind === 'json' ? 6 : 3}
      value={typeof value === 'string' ? value : ''}
      placeholder={field.placeholder}
      onChange={(e) => update(field.id, e.target.value)}
    />
  );
}

function DurationControl({ field, value, fieldId, saving, update }: ControlProps) {
  return (
    <DurationFieldInput
      id={fieldId}
      disabled={saving}
      value={typeof value === 'number' ? value : 0}
      onChange={(next) => update(field.id, next)}
    />
  );
}

export function FieldControl(props: ControlProps): React.ReactNode {
  const { field } = props;
  switch (field.kind) {
    case 'text':
    case 'password':
      return <TextControl {...props} />;
    case 'number':
      return <NumberControl {...props} />;
    case 'toggle':
      return <ToggleControl {...props} />;
    case 'select':
      return <SelectControl {...props} />;
    case 'textarea':
    case 'json':
      return <TextAreaControl {...props} />;
    case 'duration':
      return <DurationControl {...props} />;
    default:
      return null;
  }
}
