/**
 * "Edit weight" dialog. Only mutates `grams` + `notes` — `(ingredient,
 * variant, unit)` is the UNIQUE key and rotating any of those is "delete
 * + re-add" by intent.
 */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@pops/ui';

import { DialogActions, FormError } from './dialog-helpers';
import { NumberFieldRow, TextareaFieldRow } from './form-fields';

import type { IngredientWeightRow } from './types';

interface FormState {
  grams: string;
  notes: string;
}

function EditWeightForm({
  form,
  setForm,
}: {
  form: FormState;
  setForm: (next: FormState) => void;
}) {
  return (
    <>
      <NumberFieldRow
        id="edit-weight-grams"
        labelKey="data.conversions.weights.fields.grams"
        value={form.grams}
        autoFocus
        onChange={(grams) => setForm({ ...form, grams })}
      />
      <TextareaFieldRow
        id="edit-weight-notes"
        labelKey="data.conversions.weights.fields.notes"
        value={form.notes}
        onChange={(notes) => setForm({ ...form, notes })}
      />
    </>
  );
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  row: IngredientWeightRow | null;
  errorMessage: string | null;
  isSubmitting: boolean;
  onSubmit: (id: number, patch: { grams?: number; notes?: string | null }) => void;
}

export function EditWeightDialog({
  open,
  onOpenChange,
  row,
  errorMessage,
  isSubmitting,
  onSubmit,
}: Props) {
  const { t } = useTranslation('food');
  const [form, setForm] = useState<FormState>({ grams: '', notes: '' });
  useEffect(() => {
    if (open && row !== null) setForm({ grams: String(row.grams), notes: row.notes ?? '' });
  }, [open, row]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (row === null) return;
    const grams = Number(form.grams);
    if (!Number.isFinite(grams) || grams <= 0) return;
    const trimmedNotes = form.notes.trim();
    onSubmit(row.id, { grams, notes: trimmedNotes.length > 0 ? trimmedNotes : null });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {t('data.conversions.weights.edit.title', { unit: row?.unit ?? '' })}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <EditWeightForm form={form} setForm={setForm} />
          <FormError message={errorMessage} />
          <DialogActions isSubmitting={isSubmitting} onCancel={() => onOpenChange(false)} />
        </form>
      </DialogContent>
    </Dialog>
  );
}
