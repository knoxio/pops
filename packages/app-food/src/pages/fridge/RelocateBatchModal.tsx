import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
/**
 * Relocate batch modal — PRD-147.
 *
 * Single-field modal: pick a new location and call
 * `food.batches.relocate`. The service recomputes default expiry when
 * the user hasn't overridden it (PRD-145).
 */
import { useEffect, useState, type ReactElement } from 'react';

import { Button, Dialog, DialogContent, DialogHeader, DialogTitle } from '@pops/ui';

import { unwrap } from '../../food-api-helpers.js';
import { batchesGet, batchesRelocate } from '../../food-api/index.js';
import { FormError } from './form-controls.js';

import type { BatchLocation } from '@pops/app-food-db';

import type { BatchesRelocateData } from '../../food-api/types.gen.js';

type BatchesRelocateInput = NonNullable<BatchesRelocateData['body']> & { id: number };

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

function useRelocateMutation(args: {
  onClose: () => void;
  setError: (msg: string | null) => void;
}) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...body }: BatchesRelocateInput) =>
      unwrap(await batchesRelocate({ path: { id }, body })),
    onSuccess: (res) => {
      if (res.ok) {
        args.onClose();
      } else {
        args.setError(res.reason);
      }
    },
    onError: (err: Error) => args.setError(err.message),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['food', 'fridge'] });
    },
  });
}

export function RelocateBatchModal({
  batchId,
  isOpen,
  onClose,
}: RelocateBatchModalProps): ReactElement {
  const detail = useQuery({
    queryKey: ['food', 'batches', 'get', { id: batchId ?? 0 }],
    queryFn: async () => unwrap(await batchesGet({ path: { id: batchId ?? 0 } })).data,
    enabled: isOpen && batchId !== null,
  });
  const [location, setLocation] = useState<BatchLocation>('fridge');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (detail.data !== null && detail.data !== undefined) {
      setLocation(detail.data.location);
    } else if (!isOpen) {
      setError(null);
    }
  }, [detail.data, isOpen]);

  const relocateMutation = useRelocateMutation({ onClose, setError });

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
