import { useCallback, useEffect, useMemo, useState } from 'react';

import { Button, Label, Select as UiSelect } from '@pops/ui';

import { useImportStore } from '../../store/importStore';
import { autoDetectColumns, type ColumnMap } from './column-map/parsers';
import { PreviewTable } from './column-map/PreviewTable';
import { validateAllRows } from './column-map/validation';

const COLUMN_FIELDS: Array<{ key: keyof ColumnMap; label: string; required: boolean }> = [
  { key: 'date', label: 'Date', required: true },
  { key: 'description', label: 'Description', required: true },
  { key: 'amount', label: 'Amount', required: true },
  { key: 'location', label: 'Location (Town/City)', required: false },
];

interface FieldsProps {
  headers: string[];
  localColumnMap: ColumnMap;
  onChange: (field: keyof ColumnMap, value: string) => void;
}

function ColumnMapFields({ headers, localColumnMap, onChange }: FieldsProps) {
  return (
    <div className="space-y-4">
      {COLUMN_FIELDS.map((field) => {
        const isInvalid = field.required && !localColumnMap[field.key];
        return (
          <div key={field.key} className="flex items-center gap-4">
            <Label className="w-40">
              {field.label}
              {field.required && <span className="text-destructive ml-1">*</span>}
            </Label>
            <UiSelect
              name={field.key}
              value={localColumnMap[field.key] ?? ''}
              onChange={(e) => onChange(field.key, e.target.value)}
              aria-invalid={isInvalid}
              placeholder="Select column..."
              options={headers.map((header) => ({ label: header, value: header }))}
              containerClassName="flex-1"
            />
          </div>
        );
      })}
    </div>
  );
}

function ValidationErrors({ errors }: { errors: string[] }) {
  if (errors.length === 0) return null;
  return (
    <div className="p-4 bg-destructive/5 border border-destructive/20 rounded-lg">
      <h3 className="text-sm font-semibold text-destructive mb-2">
        Validation Errors ({errors.length})
      </h3>
      <ul className="text-sm text-destructive space-y-1">
        {errors.map((error, idx) => (
          <li key={idx}>• {error}</li>
        ))}
      </ul>
    </div>
  );
}

function StepFooter({
  isValidating,
  disabled,
  onBack,
  onNext,
}: {
  isValidating: boolean;
  disabled: boolean;
  onBack: () => void;
  onNext: () => void;
}) {
  return (
    <div className="flex justify-between gap-3">
      <Button variant="outline" onClick={onBack}>
        Back
      </Button>
      <Button onClick={onNext} disabled={disabled}>
        {isValidating ? 'Processing...' : 'Next'}
      </Button>
    </div>
  );
}

function useColumnMapState() {
  const { headers, rows, columnMap, setColumnMap, setParsedTransactions, nextStep, prevStep } =
    useImportStore();
  const [localColumnMap, setLocalColumnMap] = useState(columnMap);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [isValidating, setIsValidating] = useState(false);

  useEffect(() => {
    const detected = autoDetectColumns(headers);
    setLocalColumnMap(detected);
    setColumnMap(detected);
  }, [headers, setColumnMap]);

  const handleColumnChange = useCallback(
    (field: keyof ColumnMap, value: string) => {
      const updated = { ...localColumnMap, [field]: value };
      setLocalColumnMap(updated);
      setColumnMap(updated);
    },
    [localColumnMap, setColumnMap]
  );

  const handleNext = useCallback(() => {
    setIsValidating(true);
    setValidationErrors([]);
    setTimeout(() => {
      const validation = validateAllRows(rows, localColumnMap);
      if (!validation.valid) {
        setValidationErrors(validation.errors);
        setIsValidating(false);
        return;
      }
      setParsedTransactions(validation.parsedTransactions);
      setIsValidating(false);
      nextStep();
    }, 100);
  }, [rows, localColumnMap, setParsedTransactions, nextStep]);

  return {
    headers,
    rows,
    localColumnMap,
    validationErrors,
    isValidating,
    handleColumnChange,
    handleNext,
    prevStep,
  };
}

/**
 * Step 2: Map CSV columns to schema fields and validate parsing
 */
export function ColumnMapStep() {
  const s = useColumnMapState();
  const previewRows = useMemo(() => s.rows.slice(0, 10), [s.rows]);
  const disabled =
    s.isValidating ||
    !s.localColumnMap.date ||
    !s.localColumnMap.description ||
    !s.localColumnMap.amount;
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold mb-2">Map Columns</h2>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Map CSV columns to transaction fields. Showing first 10 rows.
        </p>
      </div>
      <ColumnMapFields
        headers={s.headers}
        localColumnMap={s.localColumnMap}
        onChange={s.handleColumnChange}
      />
      <PreviewTable rows={previewRows} columnMap={s.localColumnMap} />
      <ValidationErrors errors={s.validationErrors} />
      <StepFooter
        isValidating={s.isValidating}
        disabled={disabled}
        onBack={s.prevStep}
        onNext={s.handleNext}
      />
    </div>
  );
}
