/**
 * "Add plan entry" modal: `(date, slot)` is pre-filled from the trigger;
 * the form adds a recipe typeahead plus servings and notes. On success the
 * caller's `onAdded` runs after the week query invalidates.
 *
 * Spec: pillars/food/docs/prds/planning-page
 */
import { type ReactElement } from 'react';

import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@pops/ui';

import { AddPlanEntryFields } from './AddPlanEntryFields.js';
import { useAddPlanEntry } from './useAddPlanEntry.js';

export interface AddPlanEntryModalProps {
  date: string;
  slot: string;
  isOpen: boolean;
  onClose: () => void;
  onAdded?: (entryId: number) => void;
}

export function AddPlanEntryModal(props: AddPlanEntryModalProps): ReactElement {
  const form = useAddPlanEntry(props);
  const cancel = () => {
    form.reset();
    props.onClose();
  };
  return (
    <Dialog open={props.isOpen} onOpenChange={(open) => (!open ? cancel() : undefined)}>
      <DialogContent data-testid="add-plan-entry-modal" className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add to {props.slot}</DialogTitle>
          <DialogDescription>
            Plan a recipe for <span className="font-medium">{props.date}</span>
          </DialogDescription>
        </DialogHeader>
        <AddPlanEntryFields {...form} />
        <DialogFooter>
          <Button variant="ghost" onClick={cancel} disabled={form.isPending}>
            Cancel
          </Button>
          <Button onClick={form.submit} disabled={!form.canSubmit} data-testid="add-plan-submit">
            Add
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
