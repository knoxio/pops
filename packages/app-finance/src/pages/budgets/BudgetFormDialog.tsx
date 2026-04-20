import { Loader2 } from 'lucide-react';
import { Controller, type UseFormReturn } from 'react-hook-form';

import {
  Button,
  CheckboxInput,
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

import { type Budget, type BudgetFormValues, PERIOD_OPTIONS } from './types';

interface BudgetFormDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editingBudget: Budget | null;
  form: UseFormReturn<BudgetFormValues>;
  isSubmitting: boolean;
  onSubmit: (values: BudgetFormValues) => void;
}

function FormFields({ form }: { form: UseFormReturn<BudgetFormValues> }) {
  return (
    <div className="grid gap-4 py-4">
      <TextInput
        label="Category"
        placeholder="e.g. Groceries, Entertainment"
        {...form.register('category')}
        error={form.formState.errors.category?.message}
      />
      <Select
        label="Period"
        options={PERIOD_OPTIONS}
        {...form.register('period')}
        error={form.formState.errors.period?.message}
      />
      <TextInput
        type="number"
        label="Amount (Optional)"
        placeholder="0.00"
        prefix="$"
        step="0.01"
        min="0"
        {...form.register('amount')}
        error={form.formState.errors.amount?.message}
      />
      <Controller
        control={form.control}
        name="active"
        render={({ field }) => (
          <CheckboxInput
            label="Active"
            description="Enable this budget for tracking"
            checked={field.value}
            onCheckedChange={field.onChange}
          />
        )}
      />
      <div className="space-y-2">
        <Label>Notes (Optional)</Label>
        <Textarea placeholder="Additional details..." {...form.register('notes')} />
      </div>
    </div>
  );
}

export function BudgetFormDialog(props: BudgetFormDialogProps) {
  const { open, onOpenChange, editingBudget, form, isSubmitting, onSubmit } = props;
  return (
    <Dialog open={open} onOpenChange={(v) => !isSubmitting && onOpenChange(v)}>
      <DialogContent className="sm:max-w-(--size-dialog-sm)">
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <DialogHeader>
            <DialogTitle>{editingBudget ? 'Edit Budget' : 'New Budget'}</DialogTitle>
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
              {editingBudget ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
