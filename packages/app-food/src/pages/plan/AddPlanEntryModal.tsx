/**
 * PRD-143 — "Add plan entry" modal.
 *
 * Pre-filled `(date, slot)` from the trigger. Recipe picker uses
 * `food.recipes.list` typeahead; servings + notes round out the form.
 * Submit calls `food.plan.addEntry`; on success the caller's `onAdded`
 * runs after the week query invalidates.
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
