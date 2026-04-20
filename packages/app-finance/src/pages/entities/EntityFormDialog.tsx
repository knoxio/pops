import { Loader2 } from 'lucide-react';
import { Controller, type UseFormReturn } from 'react-hook-form';

import {
  Button,
  ChipInput,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Label,
  Select,
  Textarea,
  TextInput,
} from '@pops/ui';

import { ENTITY_TYPES, type Entity, type EntityFormValues, TRANSACTION_TYPES } from './types';

interface EntityFormDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editingEntity: Entity | null;
  form: UseFormReturn<EntityFormValues>;
  isSubmitting: boolean;
  onSubmit: (values: EntityFormValues) => void;
}

function NameAndType({ form }: { form: UseFormReturn<EntityFormValues> }) {
  return (
    <>
      <TextInput
        label="Name"
        placeholder="e.g. Woolworths, Netflix"
        {...form.register('name')}
        error={form.formState.errors.name?.message}
      />
      <div className="grid grid-cols-2 gap-4">
        <Select
          label="Type"
          options={ENTITY_TYPES.map((t) => ({
            label: t.charAt(0).toUpperCase() + t.slice(1),
            value: t,
          }))}
          {...form.register('type')}
        />
        <TextInput label="ABN (Optional)" placeholder="00 000 000 000" {...form.register('abn')} />
      </div>
    </>
  );
}

function TagsAndAliases({ form }: { form: UseFormReturn<EntityFormValues> }) {
  return (
    <>
      <div className="space-y-2">
        <Label>Aliases</Label>
        <Controller
          control={form.control}
          name="aliases"
          render={({ field }) => (
            <ChipInput
              placeholder="Type and press Enter..."
              value={field.value}
              onChange={field.onChange}
            />
          )}
        />
      </div>
      <Select
        label="Default Transaction Type (Optional)"
        options={TRANSACTION_TYPES}
        {...form.register('defaultTransactionType')}
      />
      <div className="space-y-2">
        <Label>Default Tags</Label>
        <Controller
          control={form.control}
          name="defaultTags"
          render={({ field }) => (
            <ChipInput
              placeholder="Type and press Enter..."
              value={field.value}
              onChange={field.onChange}
            />
          )}
        />
      </div>
      <div className="space-y-2">
        <Label>Notes (Optional)</Label>
        <Textarea placeholder="Additional details..." {...form.register('notes')} />
      </div>
    </>
  );
}

export function EntityFormDialog(props: EntityFormDialogProps) {
  const { open, onOpenChange, editingEntity, form, isSubmitting, onSubmit } = props;
  return (
    <Dialog open={open} onOpenChange={(v) => !isSubmitting && onOpenChange(v)}>
      <DialogContent className="sm:max-w-125">
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <DialogHeader>
            <DialogTitle>{editingEntity ? 'Edit Entity' : 'New Entity'}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <NameAndType form={form} />
            <TagsAndAliases form={form} />
          </div>
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
              {editingEntity ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
