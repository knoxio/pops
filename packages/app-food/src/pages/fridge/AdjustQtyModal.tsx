/**
 * Adjust qty modal — PRD-147.
 *
 * Records spoilage / waste / correction. PRD-145's `adjustBatchQty`
 * enforces sign rules: spoiled + wasted require delta < 0; correction
 * allows either sign. NegativeQty surfaces if delta would push the
 * batch below zero.
 */
import { type FormEvent, type ReactElement } from 'react';

import { Button, Dialog, DialogContent, DialogHeader, DialogTitle, Input } from '@pops/ui';

import { FieldRow, FormError } from './form-controls.js';
import { formatQty } from './format.js';
import { parseDelta, useAdjustQtyState } from './useAdjustQtyState.js';

import type { BatchAdjustReason } from '../../food-api-shared-types.js';
import type { BatchesGetResponses } from '../../food-api/types.gen.js';

type BatchDetail = BatchesGetResponses[200]['data'];

const REASONS: { value: BatchAdjustReason; label: string }[] = [
  { value: 'spoiled', label: 'Spoiled' },
  { value: 'wasted', label: 'Wasted' },
  { value: 'correction', label: 'Correction' },
];

export interface AdjustQtyModalProps {
  batchId: number | null;
  isOpen: boolean;
  onClose: () => void;
}

export function AdjustQtyModal({ batchId, isOpen, onClose }: AdjustQtyModalProps): ReactElement {
  const state = useAdjustQtyState({ batchId, isOpen, onClose });

  function handleSubmit(e: FormEvent): void {
    e.preventDefault();
    if (batchId === null) return;
    state.setError(null);
    const value = parseDelta(state.delta);
    if (value === null) {
      state.setError('Enter a non-zero adjustment.');
      return;
    }
    state.adjustMutation.mutate({ id: batchId, delta: value, reason: state.reason });
  }

  return (
    <Dialog open={isOpen} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Adjust quantity</DialogTitle>
        </DialogHeader>
        <form className="space-y-3" onSubmit={handleSubmit}>
          <BatchSummary detail={state.detail.data ?? null} />
          <FieldRow label="Adjustment (positive or negative)">
            <Input
              type="number"
              step="any"
              value={state.delta}
              onChange={(e) => state.setDelta(e.target.value)}
              required
              autoFocus
            />
          </FieldRow>
          <ReasonRadios value={state.reason} onChange={state.setReason} />
          <FormError message={state.error} />
          <ModalActions onClose={onClose} isPending={state.adjustMutation.isPending} />
        </form>
      </DialogContent>
    </Dialog>
  );
}

function BatchSummary({ detail }: { detail: BatchDetail | null }): ReactElement {
  return (
    <p className="text-sm text-muted-foreground">
      {detail?.ingredientName} / {detail?.variantName ?? '—'}
      <br />
      Current: {detail !== null ? formatQty(detail.qtyRemaining, detail.unit) : '—'}
    </p>
  );
}

function ReasonRadios({
  value,
  onChange,
}: {
  value: BatchAdjustReason;
  onChange: (r: BatchAdjustReason) => void;
}): ReactElement {
  return (
    <FieldRow label="Reason">
      <div className="space-y-1">
        {REASONS.map((r) => (
          <label key={r.value} className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="adjust-reason"
              value={r.value}
              checked={value === r.value}
              onChange={() => onChange(r.value)}
            />
            {r.label}
          </label>
        ))}
      </div>
    </FieldRow>
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
