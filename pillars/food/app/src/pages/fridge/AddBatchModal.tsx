import { Button, Dialog, DialogContent, DialogHeader, DialogTitle } from '@pops/ui';

import {
  DateAndNotesSection,
  IngredientPickerSection,
  PrepAndQtySection,
  SourceAndLocationSection,
} from './AddBatchModal.sections.js';
import { FormError } from './form-controls.js';
import { useAddBatchForm } from './useAddBatchForm.js';

/**
 * "+ Add batch" modal.
 *
 * Form state + mutation live in `useAddBatchForm`. The JSX sub-sections
 * live in `AddBatchModal.sections.tsx`. This file just stitches them
 * together with the Dialog frame and action buttons.
 */
import type { FormEvent, ReactElement } from 'react';

export interface AddBatchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAdded?: (batchId: number) => void;
}

export function AddBatchModal({ isOpen, onClose, onAdded }: AddBatchModalProps): ReactElement {
  const state = useAddBatchForm({ isOpen, onAdded, onClose });

  function handleSubmit(e: FormEvent): void {
    e.preventDefault();
    state.submit();
  }

  return (
    <Dialog open={isOpen} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add batch</DialogTitle>
        </DialogHeader>
        <form className="space-y-3" onSubmit={handleSubmit}>
          <IngredientPickerSection state={state} />
          <PrepAndQtySection state={state} />
          <SourceAndLocationSection state={state} />
          <DateAndNotesSection state={state} />
          <FormError message={state.error} />
          <ModalActions onClose={onClose} isPending={state.isPending} />
        </form>
      </DialogContent>
    </Dialog>
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
        {isPending ? 'Adding…' : 'Add batch'}
      </Button>
    </div>
  );
}
