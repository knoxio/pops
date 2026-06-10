import { ComboboxSelect, NumberInput } from '@pops/ui';

/**
 * Form-field block for `AddPlanEntryModal` — split out so the parent
 * fits within the per-function line cap.
 */
import type { ReactElement } from 'react';

export interface RecipeOption {
  value: string;
  label: string;
}

export interface AddPlanEntryFieldsProps {
  search: string;
  setSearch: (next: string) => void;
  options: RecipeOption[];
  recipeId: number | null;
  setRecipeId: (next: number | null) => void;
  isRecipesLoading: boolean;
  plannedServings: number;
  setPlannedServings: (next: number) => void;
  notes: string;
  setNotes: (next: string) => void;
  error: string | null;
}

export function AddPlanEntryFields(props: AddPlanEntryFieldsProps): ReactElement {
  return (
    <div className="space-y-4 py-2">
      <RecipePicker {...props} />
      <ServingsField
        plannedServings={props.plannedServings}
        setPlannedServings={props.setPlannedServings}
      />
      <NotesField notes={props.notes} setNotes={props.setNotes} />
      {props.error !== null && (
        <p className="text-sm text-destructive" role="alert">
          {props.error}
        </p>
      )}
    </div>
  );
}

function RecipePicker(props: AddPlanEntryFieldsProps): ReactElement {
  return (
    <div>
      <label className="block text-sm font-medium mb-1" htmlFor="add-plan-recipe-search">
        Recipe
      </label>
      <input
        id="add-plan-recipe-search"
        data-testid="add-plan-recipe-search"
        type="text"
        className="w-full border rounded px-2 py-1 text-sm mb-1"
        placeholder="Search recipes…"
        value={props.search}
        onChange={(e) => props.setSearch(e.target.value)}
      />
      <ComboboxSelect
        options={props.options}
        value={props.recipeId === null ? undefined : String(props.recipeId)}
        onChange={(v) => props.setRecipeId(Array.isArray(v) ? null : Number(v))}
        placeholder="Pick a recipe"
        searchPlaceholder="Search…"
        emptyMessage={props.isRecipesLoading ? 'Loading…' : 'No recipes match.'}
      />
    </div>
  );
}

function ServingsField(props: {
  plannedServings: number;
  setPlannedServings: (n: number) => void;
}): ReactElement {
  return (
    <div>
      <label className="block text-sm font-medium mb-1" htmlFor="add-plan-servings">
        Planned servings
      </label>
      <NumberInput
        id="add-plan-servings"
        data-testid="add-plan-servings"
        min={1}
        value={props.plannedServings}
        onChange={(e) => props.setPlannedServings(Math.max(1, Number(e.target.value)))}
      />
    </div>
  );
}

function NotesField(props: { notes: string; setNotes: (s: string) => void }): ReactElement {
  return (
    <div>
      <label className="block text-sm font-medium mb-1" htmlFor="add-plan-notes">
        Notes (optional)
      </label>
      <textarea
        id="add-plan-notes"
        data-testid="add-plan-notes"
        className="w-full border rounded px-2 py-1 text-sm h-20"
        value={props.notes}
        onChange={(e) => props.setNotes(e.target.value)}
        maxLength={1000}
      />
    </div>
  );
}
