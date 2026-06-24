/**
 * Modal for creating or editing a variant.
 *
 * Form-state + value helpers live in `variant-form-helpers.ts`; the actual
 * input rows in `VariantFormFields.tsx`. Errors come pre-mapped from
 * `useVariantActions`.
 */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button, Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@pops/ui';

import {
  BLANK_VARIANT_FORM,
  type VariantFormState,
  type VariantFormValues,
  variantFormFromRow,
  variantFormToValues,
} from './variant-form-helpers';
import { VariantFormFields } from './VariantFormFields';

import type { IngredientVariantRow } from './ingredient-wire-types.js';

export type { VariantFormValues } from './variant-form-helpers';

interface Props {
  open: boolean;
  mode: 'create' | 'edit';
  initial: IngredientVariantRow | null;
  isSubmitting: boolean;
  errorMessage: string | null;
  onCancel: () => void;
  onSubmit: (values: VariantFormValues) => void;
}

export function VariantFormDialog(props: Props) {
  const { t } = useTranslation('food');
  const [form, setForm] = useState<VariantFormState>(BLANK_VARIANT_FORM);

  useEffect(() => {
    if (props.open) setForm(variantFormFromRow(props.initial));
  }, [props.open, props.initial]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (form.slug.trim().length === 0 || form.name.trim().length === 0) return;
    props.onSubmit(variantFormToValues(form));
  }

  const title =
    props.mode === 'create'
      ? t('data.ingredients.variants.create.title')
      : t('data.ingredients.variants.edit.title');

  return (
    <Dialog open={props.open} onOpenChange={(next) => (next ? null : props.onCancel())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <VariantFormFields mode={props.mode} form={form} onChange={setForm} />
          {props.errorMessage !== null ? (
            <p role="alert" className="text-destructive text-sm">
              {props.errorMessage}
            </p>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={props.onCancel}>
              {t('data.ingredients.actions.cancel')}
            </Button>
            <Button type="submit" disabled={props.isSubmitting}>
              {props.isSubmitting
                ? t('data.ingredients.actions.saving')
                : t('data.ingredients.variants.form.submit')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
