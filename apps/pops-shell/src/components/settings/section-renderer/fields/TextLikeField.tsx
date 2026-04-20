import { Button, Input, cn } from '@pops/ui';

import { EnvLabel, FieldWrapper } from '../FieldWrapper';
import { TestActionIcon } from '../TestActionIcon';
import { useTestAction } from '../useTestAction';
import { getInputType } from '../utils';

import type { SettingsField } from '@pops/types';

import type { SaveState } from '../types';

interface TextLikeFieldProps {
  field: SettingsField;
  value: string;
  onChange: (val: string) => void;
  onTestAction: (procedure: string) => Promise<void>;
  envFallbackActive: boolean;
  saveState: SaveState;
  validationError: string;
}

export function TextLikeField({
  field,
  value,
  onChange,
  onTestAction,
  envFallbackActive,
  saveState,
  validationError,
}: TextLikeFieldProps) {
  const inputType = getInputType(field.type);
  const { testState, testError, runTest } = useTestAction(onTestAction);

  const handleTest = () => {
    if (field.testAction) void runTest(field.testAction.procedure);
  };

  return (
    <FieldWrapper field={field} saveState={saveState}>
      <div className="flex gap-2">
        <Input
          type={inputType}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          min={field.type === 'number' ? field.validation?.min : undefined}
          max={field.type === 'number' ? field.validation?.max : undefined}
          className="flex-1"
        />
        {field.testAction && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleTest}
            disabled={testState === 'loading'}
            type="button"
          >
            <TestActionIcon state={testState} fallback={null} />
            <span className={cn(testState !== 'idle' && 'ml-1')}>{field.testAction.label}</span>
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
