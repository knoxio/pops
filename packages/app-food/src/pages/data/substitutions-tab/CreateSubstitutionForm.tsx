import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button, Label, TextInput } from '@pops/ui';

import { EndpointPicker } from './EndpointPicker';

import type { SubstitutionScope } from '@pops/app-food-db';

import type { CreateSubstitutionFormInput, SubstitutionEndpointInput } from './types';

interface Props {
  isSubmitting: boolean;
  errorMessage: string | null;
  onSubmit: (input: CreateSubstitutionFormInput) => void;
}

interface FormState {
  from: SubstitutionEndpointInput | null;
  to: SubstitutionEndpointInput | null;
  ratio: string;
  scope: SubstitutionScope;
  recipeId: string;
  contextTags: string;
  notes: string;
}

const INITIAL: FormState = {
  from: null,
  to: null,
  ratio: '1',
  scope: 'global',
  recipeId: '',
  contextTags: '',
  notes: '',
};

function parseTags(raw: string): readonly string[] {
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function isFormValid(form: FormState): boolean {
  if (form.from === null || form.to === null) return false;
  const ratio = Number(form.ratio);
  if (!Number.isFinite(ratio) || ratio <= 0) return false;
  if (form.scope === 'recipe' && form.recipeId.trim().length === 0) return false;
  return true;
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

function buildSubmitInput(form: FormState): CreateSubstitutionFormInput | null {
  if (form.from === null || form.to === null) return null;
  const recipeId =
    form.scope === 'recipe' && form.recipeId.trim().length > 0 ? Number(form.recipeId) : null;
  return {
    from: form.from,
    to: form.to,
    ratio: Number(form.ratio),
    scope: form.scope,
    recipeId,
    contextTags: parseTags(form.contextTags),
    notes: form.notes.trim().length > 0 ? form.notes.trim() : null,
  };
}

export function CreateSubstitutionForm({ isSubmitting, errorMessage, onSubmit }: Props) {
  const { t } = useTranslation('food');
  const [form, setForm] = useState<FormState>(INITIAL);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isFormValid(form)) return;
    const payload = buildSubmitInput(form);
    if (payload === null) return;
    onSubmit(payload);
    setForm(INITIAL);
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
