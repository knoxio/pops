import { useState } from 'react';

import { Input, Select } from '@pops/ui';

import { FieldWrapper } from '../FieldWrapper';
import { UNIT_MULTIPLIERS, inferUnit } from '../utils';

import type { SettingsField } from '@pops/types';

import type { SaveState } from '../types';

interface DurationFieldProps {
  field: SettingsField;
  value: string;
  onChange: (key: string, value: string) => void;
  saveState: SaveState;
}

const UNIT_OPTIONS = [
  { value: 'milliseconds', label: 'ms' },
  { value: 'seconds', label: 'seconds' },
  { value: 'minutes', label: 'minutes' },
  { value: 'hours', label: 'hours' },
];

export function DurationField({ field, value, onChange, saveState }: DurationFieldProps) {
  const ms = value ? parseInt(value, 10) : 0;
  const [unit, setUnit] = useState(() => inferUnit(ms));

  const displayValue = ms ? String(ms / (UNIT_MULTIPLIERS[unit] ?? 1)) : '';

  const handleChange = (raw: string) => {
    if (raw === '') {
      onChange(field.key, '');
      return;
    }
    const n = parseFloat(raw);
    if (!isNaN(n)) onChange(field.key, String(Math.round(n * (UNIT_MULTIPLIERS[unit] ?? 1))));
  };

  return (
    <FieldWrapper field={field} saveState={saveState}>
      <div className="flex gap-2">
        <Input
          type="number"
          value={displayValue}
          min={0}
          onChange={(e) => handleChange(e.target.value)}
          className="w-32"
        />
        <Select options={UNIT_OPTIONS} value={unit} onChange={(e) => setUnit(e.target.value)} />
      </div>
    </FieldWrapper>
  );
}
