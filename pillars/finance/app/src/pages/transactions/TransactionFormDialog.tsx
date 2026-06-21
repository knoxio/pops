import { Loader2 } from 'lucide-react';
import { Controller, type UseFormReturn } from 'react-hook-form';

import {
  Button,
  ChipInput,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  EntitySelect,
  Label,
  Select,
  Textarea,
  TextInput,
} from '@pops/ui';

import { type Transaction, TRANSACTION_TYPE_OPTIONS, type TransactionFormValues } from './types';

interface DialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editingTransaction: Transaction | null;
  form: UseFormReturn<TransactionFormValues>;
  isSubmitting: boolean;
  onSubmit: (values: TransactionFormValues) => void;
  entities: Array<{ id: string; name: string; type: string }>;
}

function PrimaryFields({ form }: { form: UseFormReturn<TransactionFormValues> }) {
  return (
    <div className="grid grid-cols-2 gap-4">
      <TextInput
        type="date"
        label="Date"
        {...form.register('date')}
        error={form.formState.errors.date?.message}
      />
      <TextInput
        type="number"
        step="0.01"
        label="Amount"
        placeholder="0.00"
        prefix="$"
        {...form.register('amount')}
        error={form.formState.errors.amount?.message}
      />
    </div>
  );
}

function DescriptionField({ form }: { form: UseFormReturn<TransactionFormValues> }) {
  return (
    <TextInput
      label="Description"
      placeholder="e.g. Woolworths Metro"
      {...form.register('description')}
      error={form.formState.errors.description?.message}
    />
  );
}

function AccountAndType({ form }: { form: UseFormReturn<TransactionFormValues> }) {
  return (
    <div className="grid grid-cols-2 gap-4">
      <TextInput
        label="Account"
        placeholder="e.g. Bank Account"
        {...form.register('account')}
        error={form.formState.errors.account?.message}
      />
      <Select
        label="Type"
        options={TRANSACTION_TYPE_OPTIONS}
        {...form.register('type')}
        error={form.formState.errors.type?.message}
      />
    </div>
  );
}

function EntityField({
  form,
  entities,
}: {
  form: UseFormReturn<TransactionFormValues>;
  entities: DialogProps['entities'];
}) {
  return (
    <div className="space-y-2">
      <Label>Entity (Optional)</Label>
      <Controller
        control={form.control}
        name="entityId"
        render={({ field }) => (
          <EntitySelect
            entities={entities.map((e) => ({
              id: e.id,
              name: e.name,
              type: e.type,
            }))}
            value={field.value || undefined}
            onChange={(entityId) => field.onChange(entityId)}
            placeholder="Choose entity..."
          />
        )}
      />
    </div>
  );
}

function TagsField({ form }: { form: UseFormReturn<TransactionFormValues> }) {
  return (
    <div className="space-y-2">
      <Label>Tags</Label>
      <Controller
        control={form.control}
        name="tags"
        render={({ field }) => (
          <ChipInput
            placeholder="Type and press Enter..."
            value={field.value}
            onChange={field.onChange}
          />
        )}
      />
    </div>
  );
}

function NotesField({ form }: { form: UseFormReturn<TransactionFormValues> }) {
  return (
    <div className="space-y-2">
      <Label>Notes (Optional)</Label>
      <Textarea placeholder="Additional details..." {...form.register('notes')} />
    </div>
  );
}

function FormFields(props: {
  form: UseFormReturn<TransactionFormValues>;
  entities: DialogProps['entities'];
}) {
  return (
    <div className="grid gap-4 py-4">
      <PrimaryFields form={props.form} />
      <DescriptionField form={props.form} />
      <AccountAndType form={props.form} />
      <EntityField form={props.form} entities={props.entities} />
      <TagsField form={props.form} />
      <NotesField form={props.form} />
    </div>
  );
}

export function TransactionFormDialog(props: DialogProps) {
  const { open, onOpenChange, editingTransaction, form, isSubmitting, onSubmit, entities } = props;
  return (
    <Dialog open={open} onOpenChange={(v) => !isSubmitting && onOpenChange(v)}>
      <DialogContent className="sm:max-w-125">
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <DialogHeader>
            <DialogTitle>{editingTransaction ? 'Edit Transaction' : 'New Transaction'}</DialogTitle>
            <DialogDescription className="sr-only">
              Enter the details for this transaction
            </DialogDescription>
          </DialogHeader>
          <FormFields form={form} entities={entities} />
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
              {editingTransaction ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
