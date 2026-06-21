/**
 * "Create ingredient" modal.
 *
 * v1 fields: slug, name, defaultUnit, parentId (optional).
 * `densityGPerMl` and `notes` are post-creation edits per the PRD; the
 * dialog stays short so the data page's primary action is fast.
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button, Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@pops/ui';

import { SelectRow, TextFieldRow } from './IngredientFormFields';

import type { IngredientRow } from './ingredient-wire-types.js';

type Unit = 'g' | 'ml' | 'count';

export interface CreateIngredientInput {
  slug: string;
  name: string;
  defaultUnit: Unit;
  parentId: number | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ingredients: readonly IngredientRow[];
  isSubmitting: boolean;
  errorMessage: string | null;
  onSubmit: (input: CreateIngredientInput) => void;
}

const UNITS: readonly Unit[] = ['g', 'ml', 'count'];

interface FormState {
  slug: string;
  name: string;
  defaultUnit: Unit;
  parentId: string;
}

const INITIAL_FORM: FormState = { slug: '', name: '', defaultUnit: 'count', parentId: '' };

function CreateIngredientForm({
  form,
  setForm,
  ingredients,
}: {
  form: FormState;
  setForm: (next: FormState) => void;
  ingredients: readonly IngredientRow[];
}) {
  const { t } = useTranslation('food');
  const unitOptions = UNITS.map((u) => ({ value: u, label: u }));
  const parentOptions = [
    { value: '', label: t('data.ingredients.create.noParent') },
    ...ingredients.map((row) => ({
      value: String(row.id),
      label: `${row.name} (${row.slug})`,
    })),
  ];
  return (
    <>
      <TextFieldRow
        id="ingredient-slug"
        labelKey="data.ingredients.create.slug"
        value={form.slug}
        placeholder="banana"
        autoFocus
        onChange={(slug) => setForm({ ...form, slug })}
      />
      <TextFieldRow
        id="ingredient-name"
        labelKey="data.ingredients.create.name"
        value={form.name}
        placeholder="Banana"
        onChange={(name) => setForm({ ...form, name })}
      />
      <SelectRow
        id="ingredient-unit"
        labelKey="data.ingredients.create.defaultUnit"
        value={form.defaultUnit}
        options={unitOptions}
        onChange={(unit) => setForm({ ...form, defaultUnit: unit as Unit })}
      />
      <SelectRow
        id="ingredient-parent"
        labelKey="data.ingredients.create.parent"
        value={form.parentId}
        options={parentOptions}
        onChange={(parentId) => setForm({ ...form, parentId })}
      />
    </>
  );
}

export function CreateIngredientDialog({
  open,
  onOpenChange,
  ingredients,
  isSubmitting,
  errorMessage,
  onSubmit,
}: Props) {
  const { t } = useTranslation('food');
  const [form, setForm] = useState<FormState>(INITIAL_FORM);

  function handleOpenChange(next: boolean) {
    if (!next) setForm(INITIAL_FORM);
    onOpenChange(next);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (form.slug.trim().length === 0 || form.name.trim().length === 0) return;
    onSubmit({
      slug: form.slug.trim(),
      name: form.name.trim(),
      defaultUnit: form.defaultUnit,
      parentId: form.parentId.length > 0 ? Number(form.parentId) : null,
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('data.ingredients.create.title')}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <CreateIngredientForm form={form} setForm={setForm} ingredients={ingredients} />
          {errorMessage !== null ? (
            <p role="alert" className="text-destructive text-sm">
              {errorMessage}
            </p>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
              {t('data.ingredients.create.cancel')}
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting
                ? t('data.ingredients.create.submitting')
                : t('data.ingredients.create.submit')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
