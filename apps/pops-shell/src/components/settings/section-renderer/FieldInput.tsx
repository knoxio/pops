import { useCallback, useState } from 'react';

import { DurationField } from './fields/DurationField';
import { JsonField } from './fields/JsonField';
import { PasswordField } from './fields/PasswordField';
import { SelectField } from './fields/SelectField';
import { TextLikeField } from './fields/TextLikeField';
import { ToggleField } from './fields/ToggleField';
import { validateField } from './utils';

import type { FieldProps } from './types';

export function FieldInput(props: FieldProps) {
  const { field, value, onChange, saveState } = props;
  const [validationError, setValidationError] = useState<string>('');

  const handleChange = useCallback(
    (newVal: string) => {
      const err = validateField(field, newVal);
      setValidationError(err);
      if (err) return;
      onChange(field.key, newVal);
    },
    [field, onChange]
  );

  if (field.type === 'duration') {
    return <DurationField field={field} value={value} onChange={onChange} saveState={saveState} />;
  }

  return (
    <NonDurationField props={props} handleChange={handleChange} validationError={validationError} />
  );
}

interface NonDurationFieldProps {
  props: FieldProps;
  handleChange: (val: string) => void;
  validationError: string;
}

function NonDurationField({ props, handleChange, validationError }: NonDurationFieldProps) {
  const { field, value, onTestAction, envFallbackActive, saveState, isOptionsLoading } = props;
  const common = { field, value, envFallbackActive, saveState };

  switch (field.type) {
    case 'toggle':
      return <ToggleField {...common} onChange={handleChange} />;
    case 'select':
      return (
        <SelectField {...common} onChange={handleChange} isOptionsLoading={isOptionsLoading} />
      );
    case 'json':
      return <JsonField {...common} onChange={handleChange} />;
    case 'password':
      return (
        <PasswordField
          {...common}
          onChange={handleChange}
          onTestAction={onTestAction}
          validationError={validationError}
        />
      );
    default:
      return (
        <TextLikeField
          {...common}
          onChange={handleChange}
          onTestAction={onTestAction}
          validationError={validationError}
        />
      );
  }
}
