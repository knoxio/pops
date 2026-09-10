import { useState } from 'react';

import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Select,
  TextInput,
} from '@pops/ui';

import type { ImportConfigWire, WriteImportConfigBody } from './types';

type SourceKind = ImportConfigWire['sourceKind'];

export interface SourceFormValues {
  sourceKind: SourceKind;
  dialectId: string;
  parserId: string;
  provider: string;
  externalAccountRef: string;
  expectedCadenceDays: string;
  secretRef: string;
}

const KIND_OPTIONS = [
  { value: 'csv-dialect', label: 'CSV export' },
  { value: 'pdf-statement', label: 'PDF statement' },
  { value: 'api', label: 'Provider API' },
];

const DIALECT_OPTIONS = ['ANZ', 'ANZ Credit Card', 'Amex', 'ING', 'Up'].map((value) => ({
  value,
  label: value,
}));

/** Absence is an empty field; the form never shows a literal null. */
function text(value: string | number | null | undefined): string {
  return value === null || value === undefined ? '' : String(value);
}

export function valuesOf(config: ImportConfigWire | null): SourceFormValues {
  return {
    sourceKind: config?.sourceKind ?? 'csv-dialect',
    dialectId: text(config?.dialectId),
    parserId: text(config?.parserId),
    provider: config?.provider ?? 'up',
    externalAccountRef: text(config?.externalAccountRef),
    expectedCadenceDays: text(config?.expectedCadenceDays),
    secretRef: text(config?.secretRef),
  };
}

/** The field its kind needs; the server refuses a config without it, so the form says so first. */
export function missingRequiredField(values: SourceFormValues): string | null {
  if (values.sourceKind === 'csv-dialect' && values.dialectId === '') return 'a dialect';
  if (values.sourceKind === 'pdf-statement' && values.parserId === '') return 'a parser';
  if (values.sourceKind === 'api' && values.provider === '') return 'a provider';
  return null;
}

/** The body a save sends; empty text is absence, not an empty string. */
export function bodyOf(values: SourceFormValues): WriteImportConfigBody {
  const given = (value: string) => (value === '' ? null : value);
  const cadence = Number.parseInt(values.expectedCadenceDays, 10);
  const api = values.sourceKind === 'api';
  return {
    sourceKind: values.sourceKind,
    dialectId: values.sourceKind === 'csv-dialect' ? given(values.dialectId) : null,
    parserId: values.sourceKind === 'pdf-statement' ? given(values.parserId) : null,
    provider: api && values.provider === 'up' ? 'up' : null,
    externalAccountRef: api ? given(values.externalAccountRef) : null,
    expectedCadenceDays: Number.isFinite(cadence) && cadence > 0 ? cadence : null,
    secretRef: api ? given(values.secretRef) : null,
  };
}

function KindFields({
  values,
  set,
}: {
  values: SourceFormValues;
  set: (patch: Partial<SourceFormValues>) => void;
}) {
  if (values.sourceKind === 'csv-dialect') {
    return (
      <Select
        label="Dialect"
        options={DIALECT_OPTIONS}
        placeholder="Which bank's export is this?"
        value={values.dialectId}
        onChange={(event) => set({ dialectId: event.target.value })}
      />
    );
  }
  if (values.sourceKind === 'pdf-statement') {
    return (
      <TextInput
        label="Parser"
        placeholder="anz-pdf-statement"
        value={values.parserId}
        onChange={(event) => set({ parserId: event.target.value })}
      />
    );
  }
  return (
    <>
      <Select
        label="Provider"
        options={[{ value: 'up', label: 'Up' }]}
        value={values.provider}
        onChange={(event) => set({ provider: event.target.value })}
      />
      <TextInput
        label="Provider's account id"
        placeholder="The Up account these rows belong to"
        value={values.externalAccountRef}
        onChange={(event) => set({ externalAccountRef: event.target.value })}
      />
      <TextInput
        label="Secret name"
        placeholder="UP_API_TOKEN"
        value={values.secretRef}
        onChange={(event) => set({ secretRef: event.target.value })}
      />
    </>
  );
}

function SourceFields({
  values,
  set,
  missing,
  error,
}: {
  values: SourceFormValues;
  set: (patch: Partial<SourceFormValues>) => void;
  missing: string | null;
  error: string | null;
}) {
  return (
    <div className="space-y-4">
      <Select
        label="Fed by"
        options={KIND_OPTIONS}
        value={values.sourceKind}
        onChange={(event) => set({ sourceKind: event.target.value as SourceKind })}
      />
      <KindFields values={values} set={set} />
      <TextInput
        label="Expected cadence (days)"
        inputMode="numeric"
        placeholder="Leave empty to derive it from the batches"
        value={values.expectedCadenceDays}
        onChange={(event) => set({ expectedCadenceDays: event.target.value })}
      />
      {error !== null && <p className="text-sm text-destructive">{error}</p>}
      {missing !== null && (
        <p className="text-sm text-muted-foreground">This source needs {missing}.</p>
      )}
    </div>
  );
}

/**
 * Write the account's whole import config (finance ADR-003): there is no
 * partial write, because a config whose kind changed must also change what
 * that kind needs, and a half-written one would leave a CSV dialect beside
 * a provider's account id.
 *
 * The token itself never appears here. The form names the secret it is read
 * from, which is what the server stores.
 */
export function SourceFormDialog({
  open,
  onOpenChange,
  accountName,
  config,
  onSave,
  isSaving,
  error,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accountName: string;
  config: ImportConfigWire | null;
  onSave: (values: SourceFormValues) => void;
  isSaving: boolean;
  error: string | null;
}) {
  const [values, setValues] = useState<SourceFormValues>(() => valuesOf(config));
  const set = (patch: Partial<SourceFormValues>) => setValues((prev) => ({ ...prev, ...patch }));
  const missing = missingRequiredField(values);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) setValues(valuesOf(config));
        onOpenChange(next);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>How {accountName} is fed</DialogTitle>
          <DialogDescription>
            One statement about the source. Saving replaces the whole config.
          </DialogDescription>
        </DialogHeader>
        <SourceFields values={values} set={set} missing={missing} error={error} />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => onSave(values)} disabled={isSaving || missing !== null}>
            {isSaving ? 'Saving…' : 'Save source'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
