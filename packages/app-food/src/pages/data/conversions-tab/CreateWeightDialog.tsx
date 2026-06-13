/**
 * "Add weight" dialog. Picks an ingredient first, then (optionally) one of
 * its variants, then unit + grams + notes. Variants load lazily once an
 * ingredient is picked.
 */
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { usePillarQuery } from '@pops/pillar-sdk/react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@pops/ui';

import { DialogActions, FormError } from './dialog-helpers';
import { NumberFieldRow, SelectFieldRow, TextareaFieldRow, TextFieldRow } from './form-fields';

import type { inferRouterOutputs } from '@trpc/server';

import type { AppRouter } from '@pops/api-client';

type IngredientsGetOutput = inferRouterOutputs<AppRouter>['food']['ingredients']['get'];

export interface IngredientOption {
  id: number;
  name: string;
  slug: string;
}

interface FormState {
  ingredientId: string;
  variantId: string;
  unit: string;
  grams: string;
  notes: string;
}

const INITIAL: FormState = {
  ingredientId: '',
  variantId: '',
  unit: '',
  grams: '',
  notes: '',
};

function useVariantsFor(ingredientId: number | null) {
  return usePillarQuery<IngredientsGetOutput>(
    'food',
    ['ingredients', 'get'],
    { idOrSlug: ingredientId ?? 0 },
    { enabled: ingredientId !== null }
  );
}

function buildVariantOptions(
  detail: ReturnType<typeof useVariantsFor>['data'],
  anyLabel: string
): readonly { value: string; label: string }[] {
  const variants = detail?.variants ?? [];
  return [
    { value: '', label: anyLabel },
    ...variants.map((v) => ({ value: String(v.id), label: `${v.name} (${v.slug})` })),
  ];
}

function CreateWeightForm({
  form,
  setForm,
  ingredientOptions,
  variantOptions,
}: {
  form: FormState;
  setForm: (next: FormState) => void;
  ingredientOptions: readonly { value: string; label: string }[];
  variantOptions: readonly { value: string; label: string }[];
}) {
  return (
    <>
      <SelectFieldRow
        id="weight-ingredient"
        labelKey="data.conversions.weights.fields.ingredient"
        value={form.ingredientId}
        options={ingredientOptions}
        onChange={(ingredientId) => setForm({ ...form, ingredientId, variantId: '' })}
      />
      <SelectFieldRow
        id="weight-variant"
        labelKey="data.conversions.weights.fields.variant"
        value={form.variantId}
        options={variantOptions}
        onChange={(variantId) => setForm({ ...form, variantId })}
      />
      <TextFieldRow
        id="weight-unit"
        labelKey="data.conversions.weights.fields.unit"
        value={form.unit}
        placeholder="medium"
        required
        onChange={(unit) => setForm({ ...form, unit })}
      />
      <NumberFieldRow
        id="weight-grams"
        labelKey="data.conversions.weights.fields.grams"
        value={form.grams}
        placeholder="150"
        onChange={(grams) => setForm({ ...form, grams })}
      />
      <TextareaFieldRow
        id="weight-notes"
        labelKey="data.conversions.weights.fields.notes"
        value={form.notes}
        onChange={(notes) => setForm({ ...form, notes })}
      />
    </>
  );
}

interface SubmitInput {
  ingredientId: number;
  variantId?: number | null;
  unit: string;
  grams: number;
  notes?: string;
}

function buildSubmitInput(form: FormState, selectedIngredientId: number): SubmitInput | null {
  const grams = Number(form.grams);
  if (form.unit.trim().length === 0 || !Number.isFinite(grams) || grams <= 0) return null;
  return {
    ingredientId: selectedIngredientId,
    variantId: form.variantId.length > 0 ? Number(form.variantId) : null,
    unit: form.unit.trim(),
    grams,
    notes: form.notes.trim().length > 0 ? form.notes.trim() : undefined,
  };
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ingredients: readonly IngredientOption[];
  errorMessage: string | null;
  isSubmitting: boolean;
  onSubmit: (input: SubmitInput) => void;
}

function useCreateWeightDialogState(open: boolean, ingredients: readonly IngredientOption[]) {
  const { t } = useTranslation('food');
  const [form, setForm] = useState<FormState>(INITIAL);
  useEffect(() => {
    if (!open) setForm(INITIAL);
  }, [open]);
  const selectedIngredientId = form.ingredientId.length > 0 ? Number(form.ingredientId) : null;
  const variantsQuery = useVariantsFor(selectedIngredientId);
  const variantOptions = buildVariantOptions(
    variantsQuery.data,
    t('data.conversions.weights.anyVariant')
  );
  const ingredientOptions = useMemo(
    () => [
      { value: '', label: t('data.conversions.weights.pickIngredient') },
      ...ingredients.map((i) => ({ value: String(i.id), label: `${i.name} (${i.slug})` })),
    ],
    [ingredients, t]
  );
  return { form, setForm, selectedIngredientId, ingredientOptions, variantOptions };
}

export function CreateWeightDialog({
  open,
  onOpenChange,
  ingredients,
  errorMessage,
  isSubmitting,
  onSubmit,
}: Props) {
  const { t } = useTranslation('food');
  const state = useCreateWeightDialogState(open, ingredients);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (state.selectedIngredientId === null) return;
    const input = buildSubmitInput(state.form, state.selectedIngredientId);
    if (input !== null) onSubmit(input);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('data.conversions.weights.create.title')}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <CreateWeightForm
            form={state.form}
            setForm={state.setForm}
            ingredientOptions={state.ingredientOptions}
            variantOptions={state.variantOptions}
          />
          <FormError message={errorMessage} />
          <DialogActions isSubmitting={isSubmitting} onCancel={() => onOpenChange(false)} />
        </form>
      </DialogContent>
    </Dialog>
  );
}
