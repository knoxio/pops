import type { SubstitutionScope } from '../../../food-api-shared-types.js';
import type { CreateSubstitutionFormInput, SubstitutionEndpointInput } from './types.js';

export interface FormState {
  from: SubstitutionEndpointInput | null;
  to: SubstitutionEndpointInput | null;
  ratio: string;
  scope: SubstitutionScope;
  recipeId: string;
  contextTags: string;
  notes: string;
}

export const INITIAL_FORM: FormState = {
  from: null,
  to: null,
  ratio: '1',
  scope: 'global',
  recipeId: '',
  contextTags: '',
  notes: '',
};

export function parsePositiveInt(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;
  if (!/^\d+$/.test(trimmed)) return null;
  const num = Number(trimmed);
  if (!Number.isInteger(num) || num <= 0) return null;
  return num;
}

export function parseTags(raw: string): readonly string[] {
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export function isFormValid(form: FormState): boolean {
  if (form.from === null || form.to === null) return false;
  const ratio = Number(form.ratio);
  if (!Number.isFinite(ratio) || ratio <= 0) return false;
  if (form.scope === 'recipe' && parsePositiveInt(form.recipeId) === null) return false;
  return true;
}

export function buildSubmitInput(form: FormState): CreateSubstitutionFormInput | null {
  if (form.from === null || form.to === null) return null;
  const ratio = Number(form.ratio);
  if (!Number.isFinite(ratio) || ratio <= 0) return null;
  const recipeId = form.scope === 'recipe' ? parsePositiveInt(form.recipeId) : null;
  if (form.scope === 'recipe' && recipeId === null) return null;
  return {
    from: form.from,
    to: form.to,
    ratio,
    scope: form.scope,
    recipeId,
    contextTags: parseTags(form.contextTags),
    notes: form.notes.trim().length > 0 ? form.notes.trim() : null,
  };
}
