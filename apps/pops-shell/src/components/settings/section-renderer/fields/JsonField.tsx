import { useState } from 'react';

import { Textarea } from '@pops/ui';

import { EnvLabel, FieldWrapper } from '../FieldWrapper';

import type { SettingsField } from '@pops/types';

import type { SaveState } from '../types';

interface JsonFieldProps {
  field: SettingsField;
  value: string;
  onChange: (val: string) => void;
  envFallbackActive: boolean;
  saveState: SaveState;
}

export function JsonField({
  field,
  value,
  onChange,
  envFallbackActive,
  saveState,
}: JsonFieldProps) {
  const [jsonError, setJsonError] = useState<string>('');

  const handleBlur = (raw: string) => {
    try {
      if (raw) JSON.parse(raw);
      setJsonError('');
    } catch {
      setJsonError('Invalid JSON');
    }
  };

  return (
    <FieldWrapper field={field} saveState={saveState}>
      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={(e) => handleBlur(e.target.value)}
        rows={4}
        className="font-mono text-sm"
      />
      {jsonError && <p className="text-xs text-destructive">{jsonError}</p>}
      {envFallbackActive && field.envFallback && <EnvLabel envVar={field.envFallback} />}
    </FieldWrapper>
  );
}
