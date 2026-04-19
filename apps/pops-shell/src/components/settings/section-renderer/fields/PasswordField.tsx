import { RefreshCw } from 'lucide-react';
import { useState } from 'react';

import { Button, Input } from '@pops/ui';

import { EnvLabel, FieldWrapper } from '../FieldWrapper';
import { TestActionIcon } from '../TestActionIcon';
import { useTestAction } from '../useTestAction';

import type { SettingsField } from '@pops/types';

import type { SaveState } from '../types';

interface PasswordFieldProps {
  field: SettingsField;
  value: string;
  onChange: (val: string) => void;
  onTestAction: (procedure: string) => Promise<void>;
  envFallbackActive: boolean;
  saveState: SaveState;
  validationError: string;
}

export function PasswordField({
  field,
  value,
  onChange,
  onTestAction,
  envFallbackActive,
  saveState,
  validationError,
}: PasswordFieldProps) {
  const [revealed, setRevealed] = useState(false);
  const { testState, testError, runTest } = useTestAction(onTestAction);

  const handleTest = () => {
    if (field.testAction) void runTest(field.testAction.procedure);
  };

  return (
    <FieldWrapper field={field} saveState={saveState}>
      <div className="flex gap-2">
        <Input
          type={revealed ? 'text' : 'password'}
          value={value}
          placeholder={envFallbackActive ? '(from environment)' : '••••••••'}
          onChange={(e) => onChange(e.target.value)}
          className="flex-1"
        />
        <Button variant="outline" size="sm" onClick={() => setRevealed((r) => !r)} type="button">
          {revealed ? 'Hide' : 'Reveal'}
        </Button>
        {field.testAction && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleTest}
            disabled={testState === 'loading'}
            type="button"
          >
            <TestActionIcon state={testState} fallback={<RefreshCw className="h-3.5 w-3.5" />} />
            <span className="ml-1">{field.testAction.label}</span>
          </Button>
        )}
      </div>
      {testState === 'error' && testError && (
        <p className="text-xs text-destructive">{testError}</p>
      )}
      {validationError && <p className="text-xs text-destructive">{validationError}</p>}
      {envFallbackActive && field.envFallback && <EnvLabel envVar={field.envFallback} />}
    </FieldWrapper>
  );
}
