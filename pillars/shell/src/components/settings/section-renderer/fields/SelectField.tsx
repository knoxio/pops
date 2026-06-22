import { Select } from '@pops/ui';

import { EnvLabel, FieldWrapper } from '../FieldWrapper';

import type { SettingsField } from '@pops/types';

import type { SaveState } from '../types';

interface SelectFieldProps {
  field: SettingsField;
  value: string;
  onChange: (val: string) => void;
  envFallbackActive: boolean;
  saveState: SaveState;
  isOptionsLoading?: boolean;
}

export function SelectField({
  field,
  value,
  onChange,
  envFallbackActive,
  saveState,
  isOptionsLoading,
}: SelectFieldProps) {
  return (
    <FieldWrapper field={field} saveState={saveState}>
      {isOptionsLoading ? (
        <Select disabled options={[]} placeholder="Loading options…" value="" />
      ) : (
        <Select
          options={field.options ?? []}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
      {envFallbackActive && field.envFallback && <EnvLabel envVar={field.envFallback} />}
    </FieldWrapper>
  );
}
