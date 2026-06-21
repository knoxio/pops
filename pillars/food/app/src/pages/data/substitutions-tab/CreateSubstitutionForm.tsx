import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button, Label, TextInput } from '@pops/ui';

import {
  buildSubmitInput,
  INITIAL_FORM,
  isFormValid,
  type FormState,
} from './create-form-helpers.js';
import { EndpointPicker } from './EndpointPicker';

import type { SubstitutionScope } from '../../../food-api-shared-types.js';
import type { CreateSubstitutionFormInput } from './types';

interface Props {
  isSubmitting: boolean;
  errorMessage: string | null;
  onSubmit: (input: CreateSubstitutionFormInput) => void;
}

function EndpointFields({
  form,
  setForm,
}: {
  form: FormState;
  setForm: (next: FormState) => void;
}) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <EndpointPicker
        labelKey="data.substitutions.create.from"
        value={form.from}
        onChange={(next) => setForm({ ...form, from: next })}
      />
      <EndpointPicker
        labelKey="data.substitutions.create.to"
        value={form.to}
        onChange={(next) => setForm({ ...form, to: next })}
      />
    </div>
  );
}

function RatioScopeFields({
  form,
  setForm,
}: {
  form: FormState;
  setForm: (next: FormState) => void;
}) {
  const { t } = useTranslation('food');
  return (
    <div className="grid gap-3 md:grid-cols-3">
      <div className="grid gap-1.5">
        <Label htmlFor="sub-create-ratio">{t('data.substitutions.create.ratio')}</Label>
        <TextInput
          id="sub-create-ratio"
          value={form.ratio}
          onChange={(e) => setForm({ ...form, ratio: e.target.value })}
          inputMode="decimal"
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="sub-create-scope">{t('data.substitutions.create.scope')}</Label>
        <select
          id="sub-create-scope"
          value={form.scope}
          onChange={(e) => setForm({ ...form, scope: e.target.value as SubstitutionScope })}
          className="border-input bg-background h-9 rounded-md border px-3 text-sm"
        >
          <option value="global">{t('data.substitutions.scope.global')}</option>
          <option value="recipe">{t('data.substitutions.scope.recipe')}</option>
        </select>
      </div>
      {form.scope === 'recipe' ? (
        <div className="grid gap-1.5">
          <Label htmlFor="sub-create-recipe">{t('data.substitutions.create.recipeId')}</Label>
          <TextInput
            id="sub-create-recipe"
            value={form.recipeId}
            onChange={(e) => setForm({ ...form, recipeId: e.target.value })}
            inputMode="numeric"
            placeholder={t('data.substitutions.create.recipeIdHint')}
          />
        </div>
      ) : null}
    </div>
  );
}

function TagsNotesFields({
  form,
  setForm,
}: {
  form: FormState;
  setForm: (next: FormState) => void;
}) {
  const { t } = useTranslation('food');
  return (
    <>
      <div className="grid gap-1.5">
        <Label htmlFor="sub-create-tags">{t('data.substitutions.create.contextTags')}</Label>
        <TextInput
          id="sub-create-tags"
          value={form.contextTags}
          onChange={(e) => setForm({ ...form, contextTags: e.target.value })}
          placeholder={t('data.substitutions.create.contextTagsHint')}
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="sub-create-notes">{t('data.substitutions.create.notes')}</Label>
        <TextInput
          id="sub-create-notes"
          value={form.notes}
          onChange={(e) => setForm({ ...form, notes: e.target.value })}
        />
      </div>
    </>
  );
}

export function CreateSubstitutionForm({ isSubmitting, errorMessage, onSubmit }: Props) {
  const { t } = useTranslation('food');
  const [form, setForm] = useState<FormState>(INITIAL_FORM);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isFormValid(form)) return;
    const payload = buildSubmitInput(form);
    if (payload === null) return;
    onSubmit(payload);
    setForm(INITIAL_FORM);
  }

  return (
    <form
      onSubmit={handleSubmit}
      aria-labelledby="sub-create-heading"
      className="border-border space-y-3 rounded-md border p-4"
    >
      <h2 id="sub-create-heading" className="text-sm font-semibold uppercase tracking-wide">
        {t('data.substitutions.create.heading')}
      </h2>
      <EndpointFields form={form} setForm={setForm} />
      <RatioScopeFields form={form} setForm={setForm} />
      <TagsNotesFields form={form} setForm={setForm} />
      {errorMessage !== null ? (
        <p role="alert" className="text-destructive text-sm">
          {errorMessage}
        </p>
      ) : null}
      <div className="flex justify-end">
        <Button type="submit" disabled={isSubmitting || !isFormValid(form)}>
          {isSubmitting
            ? t('data.substitutions.create.submitting')
            : t('data.substitutions.create.submit')}
        </Button>
      </div>
    </form>
  );
}
