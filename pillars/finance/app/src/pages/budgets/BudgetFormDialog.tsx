import { Loader2 } from 'lucide-react';
import { Controller, type UseFormReturn } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import {
  Button,
  CheckboxInput,
  Dialog,
  DialogContent,
  DialogDescription,
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
  const { t } = useTranslation('finance');
  return (
    <div className="grid gap-4 py-4">
      <TextInput
        label={t('field.category')}
        placeholder={t('placeholder.category')}
        {...form.register('category')}
        error={form.formState.errors.category?.message}
      />
      <Select
        label={t('field.period')}
        options={PERIOD_OPTIONS}
        {...form.register('period')}
        error={form.formState.errors.period?.message}
      />
      <TextInput
        type="number"
        label={t('field.amountOptional')}
        placeholder={t('placeholder.amount')}
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
            label={t('field.active')}
            description={t('budgets.enableTracking')}
            checked={field.value}
            onCheckedChange={field.onChange}
          />
        )}
      />
      <div className="space-y-2">
        <Label>{t('field.notesOptional')}</Label>
        <Textarea placeholder={t('placeholder.additionalDetails')} {...form.register('notes')} />
      </div>
    </div>
  );
}

export function BudgetFormDialog(props: BudgetFormDialogProps) {
  const { t } = useTranslation('finance');
  const { open, onOpenChange, editingBudget, form, isSubmitting, onSubmit } = props;
  return (
    <Dialog open={open} onOpenChange={(v) => !isSubmitting && onOpenChange(v)}>
      <DialogContent className="sm:max-w-(--size-dialog-sm)">
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <DialogHeader>
            <DialogTitle>
              {editingBudget ? t('budgets.editBudget') : t('budgets.newBudget')}
            </DialogTitle>
            <DialogDescription className="sr-only">
              Enter the details for your budget
            </DialogDescription>
          </DialogHeader>
          <FormFields form={form} />
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              {t('common:cancel')}
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editingBudget ? t('common:update') : t('common:create')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
