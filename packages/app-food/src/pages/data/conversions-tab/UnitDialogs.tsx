/**
 * Create + edit dialogs for unit_conversions.
 *
 * The create dialog collects from / to / ratio / notes. The edit dialog
 * only mutates ratio + notes — `from_unit` and `to_unit` form the UNIQUE
 * key (PRD-123 Phase A) and changing them is "delete + re-create" by
 * intent; the PRD lists inline ratio + notes edit as the supported action.
 */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@pops/ui';

import { DialogActions, FormError } from './dialog-helpers';
import { NumberFieldRow, SelectFieldRow, TextareaFieldRow, TextFieldRow } from './form-fields';
import { CANONICAL_UNITS, type CanonicalUnit, type UnitConversionRow } from './types';

interface CreateState {
  fromUnit: string;
  toUnit: CanonicalUnit;
  ratio: string;
  notes: string;
}

const CREATE_INITIAL: CreateState = { fromUnit: '', toUnit: 'ml', ratio: '', notes: '' };

function CreateUnitForm({
  form,
  setForm,
}: {
  form: CreateState;
  setForm: (next: CreateState) => void;
}) {
  const toOptions = CANONICAL_UNITS.map((u) => ({ value: u, label: u }));
  return (
    <>
      <TextFieldRow
        id="unit-from"
        labelKey="data.conversions.units.fields.from"
        value={form.fromUnit}
        placeholder="cup"
        required
        autoFocus
        onChange={(fromUnit) => setForm({ ...form, fromUnit })}
      />
      <SelectFieldRow
        id="unit-to"
        labelKey="data.conversions.units.fields.to"
        value={form.toUnit}
        options={toOptions}
        onChange={(toUnit) => setForm({ ...form, toUnit: toUnit as CanonicalUnit })}
      />
      <NumberFieldRow
        id="unit-ratio"
        labelKey="data.conversions.units.fields.ratio"
        value={form.ratio}
        placeholder="240"
        onChange={(ratio) => setForm({ ...form, ratio })}
      />
      <TextareaFieldRow
        id="unit-notes"
        labelKey="data.conversions.units.fields.notes"
        value={form.notes}
        placeholder="US cup"
        onChange={(notes) => setForm({ ...form, notes })}
      />
    </>
  );
}

interface CreateProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  errorMessage: string | null;
  isSubmitting: boolean;
  onSubmit: (input: {
    fromUnit: string;
    toUnit: CanonicalUnit;
    ratio: number;
    notes?: string;
  }) => void;
}

export function CreateUnitDialog({
  open,
  onOpenChange,
  errorMessage,
  isSubmitting,
  onSubmit,
}: CreateProps) {
  const { t } = useTranslation('food');
  const [form, setForm] = useState<CreateState>(CREATE_INITIAL);
  useEffect(() => {
    if (!open) setForm(CREATE_INITIAL);
  }, [open]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const ratio = Number(form.ratio);
    if (form.fromUnit.trim().length === 0 || !Number.isFinite(ratio) || ratio <= 0) return;
    onSubmit({
      fromUnit: form.fromUnit.trim(),
      toUnit: form.toUnit,
      ratio,
      notes: form.notes.trim().length > 0 ? form.notes.trim() : undefined,
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('data.conversions.units.create.title')}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <CreateUnitForm form={form} setForm={setForm} />
          <FormError message={errorMessage} />
          <DialogActions isSubmitting={isSubmitting} onCancel={() => onOpenChange(false)} />
        </form>
      </DialogContent>
    </Dialog>
  );
}

interface EditState {
  ratio: string;
  notes: string;
}

function EditUnitForm({ form, setForm }: { form: EditState; setForm: (next: EditState) => void }) {
  return (
    <>
      <NumberFieldRow
        id="edit-unit-ratio"
        labelKey="data.conversions.units.fields.ratio"
        value={form.ratio}
        autoFocus
        onChange={(ratio) => setForm({ ...form, ratio })}
      />
      <TextareaFieldRow
        id="edit-unit-notes"
        labelKey="data.conversions.units.fields.notes"
        value={form.notes}
        onChange={(notes) => setForm({ ...form, notes })}
      />
    </>
  );
}

interface EditProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  row: UnitConversionRow | null;
  errorMessage: string | null;
  isSubmitting: boolean;
  onSubmit: (id: number, patch: { ratio?: number; notes?: string | null }) => void;
}

export function EditUnitDialog({
  open,
  onOpenChange,
  row,
  errorMessage,
  isSubmitting,
  onSubmit,
}: EditProps) {
  const { t } = useTranslation('food');
  const [form, setForm] = useState<EditState>({ ratio: '', notes: '' });
  useEffect(() => {
    if (open && row !== null) setForm({ ratio: String(row.ratio), notes: row.notes ?? '' });
  }, [open, row]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (row === null) return;
    const ratio = Number(form.ratio);
    if (!Number.isFinite(ratio) || ratio <= 0) return;
    const trimmedNotes = form.notes.trim();
    onSubmit(row.id, { ratio, notes: trimmedNotes.length > 0 ? trimmedNotes : null });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {t('data.conversions.units.edit.title', {
              from: row?.fromUnit ?? '',
              to: row?.toUnit ?? '',
            })}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <EditUnitForm form={form} setForm={setForm} />
          <FormError message={errorMessage} />
          <DialogActions isSubmitting={isSubmitting} onCancel={() => onOpenChange(false)} />
        </form>
      </DialogContent>
    </Dialog>
  );
}
