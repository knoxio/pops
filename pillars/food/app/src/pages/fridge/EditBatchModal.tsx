/**
 * Edit batch modal — PRD-147.
 *
 * Edits expiry / notes / prepState only. Other fields delegated to
 * Relocate / Adjust qty per PRD-145's service split.
 */
import { type FormEvent, type ReactElement } from 'react';

import { Button, Dialog, DialogContent, DialogHeader, DialogTitle, Input } from '@pops/ui';

import { FieldRow, FormError } from './form-controls.js';
import { type EditState, useEditBatchState } from './useEditBatchState.js';

export interface EditBatchModalProps {
  batchId: number | null;
  isOpen: boolean;
  onClose: () => void;
}

export function EditBatchModal({ batchId, isOpen, onClose }: EditBatchModalProps): ReactElement {
  const state = useEditBatchState({ batchId, isOpen, onClose });

  function handleSubmit(e: FormEvent): void {
    e.preventDefault();
    if (batchId === null) return;
    state.setError(null);
    state.editMutation.mutate({
      id: batchId,
      ...buildEditPatch(state.form, state.isFromRun),
    });
  }

  return (
    <Dialog open={isOpen} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit batch</DialogTitle>
        </DialogHeader>
        <form className="space-y-3" onSubmit={handleSubmit}>
          <p className="text-sm text-muted-foreground">
            {state.detail.data?.ingredientName} / {state.detail.data?.variantName ?? '—'}
          </p>
          <EditFields
            form={state.form}
            setForm={state.setForm}
            isFromRun={state.isFromRun}
            prepStates={state.prepStates.data?.items ?? []}
          />
          <FormError message={state.error} />
          <ModalActions onClose={onClose} isPending={state.editMutation.isPending} />
        </form>
      </DialogContent>
    </Dialog>
  );
}

function resolvePrepStateForPatch(
  prepStateId: string,
  isFromRun: boolean
): number | null | undefined {
  if (isFromRun) return undefined;
  if (prepStateId.length === 0) return null;
  return Number(prepStateId);
}

function buildEditPatch(
  form: EditState,
  isFromRun: boolean
): {
  expiresAt: string | null;
  notes: string | null;
  prepStateId: number | null | undefined;
} {
  return {
    expiresAt: toIsoOrNull(form.expiresAt),
    notes: form.notes.trim().length === 0 ? null : form.notes.trim(),
    prepStateId: resolvePrepStateForPatch(form.prepStateId, isFromRun),
  };
}

function toIsoOrNull(yyyyMmDd: string): string | null {
  if (yyyyMmDd.length === 0) return null;
  // `<input type="date">` should always give us YYYY-MM-DD, but typed values
  // and browser quirks can produce something `new Date()` rejects. Clear
  // expiry in that case rather than letting `.toISOString()` throw.
  const d = new Date(`${yyyyMmDd}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

interface EditFieldsProps {
  form: EditState;
  setForm: (next: EditState) => void;
  isFromRun: boolean;
  prepStates: readonly { id: number; name: string }[];
}

function EditFields({ form, setForm, isFromRun, prepStates }: EditFieldsProps): ReactElement {
  return (
    <>
      <FieldRow label="Expires">
        <Input
          type="date"
          value={form.expiresAt}
          onChange={(e) => setForm({ ...form, expiresAt: e.target.value })}
        />
      </FieldRow>
      <FieldRow label="Prep state">
        <select
          className="w-full rounded border bg-background px-2 py-1"
          value={form.prepStateId}
          onChange={(e) => setForm({ ...form, prepStateId: e.target.value })}
          disabled={isFromRun}
        >
          <option value="">— none —</option>
          {prepStates.map((p) => (
            <option key={p.id} value={String(p.id)}>
              {p.name}
            </option>
          ))}
        </select>
        {isFromRun && (
          <span className="text-xs text-muted-foreground">
            Cook-yielded batches keep their original prep state.
          </span>
        )}
      </FieldRow>
      <FieldRow label="Notes">
        <textarea
          className="min-h-[60px] w-full rounded border bg-background px-2 py-1"
          maxLength={500}
          value={form.notes}
          onChange={(e) => setForm({ ...form, notes: e.target.value })}
        />
      </FieldRow>
    </>
  );
}

function ModalActions({
  onClose,
  isPending,
}: {
  onClose: () => void;
  isPending: boolean;
}): ReactElement {
  return (
    <div className="flex justify-end gap-2 pt-2">
      <Button type="button" variant="ghost" onClick={onClose} disabled={isPending}>
        Cancel
      </Button>
      <Button type="submit" disabled={isPending}>
        {isPending ? 'Saving…' : 'Save'}
      </Button>
    </div>
  );
}
