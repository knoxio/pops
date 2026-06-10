/**
 * Relocate batch modal — PRD-147.
 *
 * Single-field modal: pick a new location and call
 * `food.batches.relocate`. The service recomputes default expiry when
 * the user hasn't overridden it (PRD-145).
 */
import { useEffect, useState, type ReactElement } from 'react';

import { trpc } from '@pops/api-client';
import { Button, Dialog, DialogContent, DialogHeader, DialogTitle } from '@pops/ui';

import { FormError } from './form-controls.js';

import type { BatchLocation } from '@pops/app-food-db';

const LOCATIONS: { value: BatchLocation; label: string }[] = [
  { value: 'pantry', label: 'Pantry' },
  { value: 'fridge', label: 'Fridge' },
  { value: 'freezer', label: 'Freezer' },
  { value: 'other', label: 'Other' },
];

export interface RelocateBatchModalProps {
  batchId: number | null;
  isOpen: boolean;
  onClose: () => void;
}

export function RelocateBatchModal({
  batchId,
  isOpen,
  onClose,
}: RelocateBatchModalProps): ReactElement {
  const utils = trpc.useUtils();
  const detail = trpc.food.batches.get.useQuery(
    { id: batchId ?? 0 },
    { enabled: isOpen && batchId !== null }
  );
  const [location, setLocation] = useState<BatchLocation>('fridge');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (detail.data !== null && detail.data !== undefined) {
      setLocation(detail.data.location);
    } else if (!isOpen) {
      setError(null);
    }
  }, [detail.data, isOpen]);

  const relocateMutation = trpc.food.batches.relocate.useMutation({
    onSuccess: (res) => {
      if (res.ok) {
        void utils.food.fridge.view.invalidate();
        onClose();
      } else {
        setError(res.reason);
      }
    },
    onError: (err) => setError(err.message),
  });

  function handleSave(): void {
    if (batchId === null) return;
    setError(null);
    relocateMutation.mutate({ id: batchId, location });
  }

  return (
    <Dialog open={isOpen} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Relocate batch</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {detail.data?.ingredientName} / {detail.data?.variantName ?? '—'}
          </p>
          <LocationRadios value={location} onChange={setLocation} />
          <FormError message={error} />
          <ModalActions
            onCancel={onClose}
            onSave={handleSave}
            isPending={relocateMutation.isPending}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}

function LocationRadios({
  value,
  onChange,
}: {
  value: BatchLocation;
  onChange: (loc: BatchLocation) => void;
}): ReactElement {
  return (
    <div className="space-y-2">
      {LOCATIONS.map((opt) => (
        <label key={opt.value} className="flex items-center gap-2 text-sm">
          <input
            type="radio"
            name="relocate-location"
            value={opt.value}
            checked={value === opt.value}
            onChange={() => onChange(opt.value)}
          />
          {opt.label}
        </label>
      ))}
    </div>
  );
}

interface ModalActionsProps {
  onCancel: () => void;
  onSave: () => void;
  isPending: boolean;
}

function ModalActions({ onCancel, onSave, isPending }: ModalActionsProps): ReactElement {
  return (
    <div className="flex justify-end gap-2 pt-2">
      <Button type="button" variant="ghost" onClick={onCancel} disabled={isPending}>
        Cancel
      </Button>
      <Button onClick={onSave} disabled={isPending}>
        {isPending ? 'Saving…' : 'Save'}
      </Button>
    </div>
  );
}
