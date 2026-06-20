import { Input } from '@pops/ui';

import { FieldRow, RadioRow } from './form-controls.js';
import { type AddBatchFormState, type useAddBatchForm } from './useAddBatchForm.js';

/**
 * JSX sub-sections for `AddBatchModal` — kept here so the modal file
 * itself stays under the `max-lines` budget.
 */
import type { ReactElement } from 'react';

import type {
  BatchLocation,
  BatchUnit,
  ManualBatchSourceType,
} from '../../food-api-shared-types.js';

const SOURCE_OPTIONS = [
  { value: 'purchase', label: 'Purchase' },
  { value: 'gift', label: 'Gift' },
  { value: 'other', label: 'Other' },
] as const;

const LOCATION_OPTIONS = [
  { value: 'pantry', label: 'Pantry' },
  { value: 'fridge', label: 'Fridge' },
  { value: 'freezer', label: 'Freezer' },
  { value: 'other', label: 'Other' },
] as const;

export type AddFormState = ReturnType<typeof useAddBatchForm>;

export function IngredientPickerSection({ state }: { state: AddFormState }): ReactElement {
  return (
    <>
      <FieldRow label="Search ingredient">
        <Input
          value={state.form.search}
          placeholder="tomato"
          onChange={(e) => state.setForm({ ...state.form, search: e.target.value })}
        />
      </FieldRow>
      <FieldRow label="Ingredient">
        <select
          className="w-full rounded border bg-background px-2 py-1"
          value={state.form.ingredientId}
          onChange={(e) =>
            state.setForm({ ...state.form, ingredientId: e.target.value, variantId: '' })
          }
          required
        >
          <option value="">Pick an ingredient…</option>
          {state.ingredients.map((ing) => (
            <option key={ing.id} value={String(ing.id)}>
              {ing.name} ({ing.slug})
            </option>
          ))}
        </select>
      </FieldRow>
      <FieldRow label="Variant">
        <select
          className="w-full rounded border bg-background px-2 py-1"
          value={state.form.variantId}
          onChange={(e) => handleVariantChange(state, e.target.value)}
          required
          disabled={state.form.ingredientId.length === 0}
        >
          <option value="">Pick a variant…</option>
          {state.variants.map((v) => (
            <option key={v.id} value={String(v.id)}>
              {v.name} ({v.slug})
            </option>
          ))}
        </select>
      </FieldRow>
    </>
  );
}

function handleVariantChange(state: AddFormState, value: string): void {
  const variant = state.variants.find((v) => String(v.id) === value);
  state.setForm({
    ...state.form,
    variantId: value,
    unit: (variant?.defaultUnit as BatchUnit | undefined) ?? state.form.unit,
  });
}

export function PrepAndQtySection({ state }: { state: AddFormState }): ReactElement {
  return (
    <>
      <FieldRow label="Prep state (optional)">
        <select
          className="w-full rounded border bg-background px-2 py-1"
          value={state.form.prepStateId}
          onChange={(e) => state.setForm({ ...state.form, prepStateId: e.target.value })}
        >
          <option value="">— none —</option>
          {state.prepStates.map((p) => (
            <option key={p.id} value={String(p.id)}>
              {p.name}
            </option>
          ))}
        </select>
      </FieldRow>
      <div className="grid grid-cols-2 gap-2">
        <FieldRow label="Quantity">
          <Input
            type="number"
            step="any"
            min="0"
            value={state.form.qty}
            onChange={(e) => state.setForm({ ...state.form, qty: e.target.value })}
            required
          />
        </FieldRow>
        <FieldRow label="Unit">
          <select
            className="w-full rounded border bg-background px-2 py-1"
            value={state.form.unit}
            onChange={(e) => state.setForm({ ...state.form, unit: e.target.value as BatchUnit })}
          >
            <option value="g">g</option>
            <option value="ml">ml</option>
            <option value="count">count</option>
          </select>
        </FieldRow>
      </div>
    </>
  );
}

export function SourceAndLocationSection({ state }: { state: AddFormState }): ReactElement {
  return (
    <>
      <FieldRow label="Source">
        <RadioRow
          name="source"
          value={state.form.sourceType}
          options={SOURCE_OPTIONS}
          onChange={(v) => state.setForm({ ...state.form, sourceType: v as ManualBatchSourceType })}
        />
      </FieldRow>
      <FieldRow label="Location">
        <RadioRow
          name="location"
          value={state.form.location}
          options={LOCATION_OPTIONS}
          onChange={(v) => state.setForm({ ...state.form, location: v as BatchLocation })}
        />
      </FieldRow>
    </>
  );
}

export function DateAndNotesSection({ state }: { state: AddFormState }): ReactElement {
  const set = (patch: Partial<AddBatchFormState>): void =>
    state.setForm({ ...state.form, ...patch });
  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        <FieldRow label="Produced">
          <Input
            type="date"
            value={state.form.producedAt}
            onChange={(e) => set({ producedAt: e.target.value })}
          />
        </FieldRow>
        <FieldRow label="Expires (optional)">
          <Input
            type="date"
            value={state.form.expiresAt}
            onChange={(e) => set({ expiresAt: e.target.value })}
          />
        </FieldRow>
      </div>
      <FieldRow label="Notes (optional)">
        <textarea
          className="min-h-[60px] w-full rounded border bg-background px-2 py-1"
          maxLength={500}
          value={state.form.notes}
          onChange={(e) => set({ notes: e.target.value })}
        />
      </FieldRow>
    </>
  );
}
