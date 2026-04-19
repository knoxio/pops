import { Switch } from '@pops/ui';

import { EnvLabel, FieldWrapper } from '../FieldWrapper';

import type { SettingsField } from '@pops/types';

import type { SaveState } from '../types';

interface ToggleFieldProps {
  field: SettingsField;
  value: string;
  onChange: (val: string) => void;
  envFallbackActive: boolean;
  saveState: SaveState;
}

export function ToggleField({
  field,
  value,
  onChange,
  envFallbackActive,
  saveState,
}: ToggleFieldProps) {
  return (
    <FieldWrapper field={field} saveState={saveState}>
      <Switch
        checked={value === 'true'}
        onCheckedChange={(checked) => onChange(checked ? 'true' : 'false')}
      />
      {envFallbackActive && field.envFallback && <EnvLabel envVar={field.envFallback} />}
    </FieldWrapper>
  );
}
