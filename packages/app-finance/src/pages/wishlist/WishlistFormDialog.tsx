import { Loader2 } from 'lucide-react';
import { type UseFormReturn } from 'react-hook-form';

import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Select,
  TextInput,
} from '@pops/ui';

import { PRIORITY_OPTIONS, type WishlistFormValues, type WishlistItem } from './types';

interface DialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editingItem: WishlistItem | null;
  form: UseFormReturn<WishlistFormValues>;
  isSubmitting: boolean;
  onSubmit: (values: WishlistFormValues) => void;
}

function FormFields({ form }: { form: UseFormReturn<WishlistFormValues> }) {
  return (
    <div className="grid gap-4 py-4">
      <div className="space-y-2">
        <TextInput
          label="Item Name"
          placeholder="e.g. Mechanical Keyboard"
          {...form.register('item')}
          error={form.formState.errors.item?.message}
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <TextInput
          type="number"
          label="Target Amount"
          placeholder="0.00"
          prefix="$"
          {...form.register('targetAmount', { valueAsNumber: true })}
          error={form.formState.errors.targetAmount?.message}
        />
        <TextInput
          type="number"
          label="Already Saved"
          placeholder="0.00"
          prefix="$"
          {...form.register('saved', { valueAsNumber: true })}
          error={form.formState.errors.saved?.message}
        />
      </div>
      <div className="space-y-2">
        <Select
          label="Priority"
          options={PRIORITY_OPTIONS}
          {...form.register('priority')}
          error={form.formState.errors.priority?.message}
        />
      </div>
      <div className="space-y-2">
        <TextInput
          label="URL (Optional)"
          placeholder="https://..."
          {...form.register('url')}
          error={form.formState.errors.url?.message}
        />
      </div>
      <div className="space-y-2">
        <TextInput
          label="Notes"
          placeholder="Why do you want this?"
          {...form.register('notes')}
          error={form.formState.errors.notes?.message}
        />
      </div>
    </div>
  );
}

export function WishlistFormDialog(props: DialogProps) {
  const { open, onOpenChange, editingItem, form, isSubmitting, onSubmit } = props;
  return (
    <Dialog open={open} onOpenChange={(v) => !isSubmitting && onOpenChange(v)}>
      <DialogContent className="sm:max-w-(--size-dialog-sm)">
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <DialogHeader>
            <DialogTitle>{editingItem ? 'Edit Item' : 'New Wishlist Item'}</DialogTitle>
          </DialogHeader>
          <FormFields form={form} />
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editingItem ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
