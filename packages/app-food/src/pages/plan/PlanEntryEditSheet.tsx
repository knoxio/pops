/**
 * PRD-143 — plan entry edit sheet.
 *
 * Fixed right-side drawer at all sizes (full-width on narrow viewports).
 * The PRD's bottom-sheet variant for mobile is tracked as a follow-up.
 * Surfaces servings + notes + "Mark cooked" CTA (which links into
 * PRD-144's cook flow) + delete. When the entry has a non-null
 * `recipe_run_id` the form is read-only and shows "Cooked on".
 */
import { useEffect, useState, type ReactElement } from 'react';
import { Link } from 'react-router';

import { trpc } from '@pops/api-client';
import { Button, NumberInput } from '@pops/ui';

import { usePlanEntryEdit } from './usePlanEntryEdit.js';

import type { WirePlanEntryRow } from '@pops/app-food-db';

export interface PlanEntryEditSheetProps {
  entryId: number | null;
  weekStart: string;
  isOpen: boolean;
  onClose: () => void;
}

export function PlanEntryEditSheet(props: PlanEntryEditSheetProps): ReactElement | null {
  const { entryId, weekStart, isOpen, onClose } = props;
  const weekQuery = trpc.food.plan.weekView.useQuery({ weekStart }, { enabled: isOpen });
  const entry = (weekQuery.data?.entries ?? []).find((e) => e.id === entryId) ?? null;
  if (!isOpen || entry === null) return null;
  return (
    <aside
      className="fixed inset-y-0 right-0 w-full sm:w-96 bg-background border-l shadow-xl z-50 p-6 overflow-y-auto"
      role="dialog"
      aria-label={`Edit plan entry for ${entry.recipeTitle}`}
      data-testid="plan-entry-edit-sheet"
    >
      <Header entry={entry} onClose={onClose} />
      {entry.recipeRunId === null ? (
        <EditableBody entry={entry} onSaved={onClose} onDeleted={onClose} />
      ) : (
        <CookedBody entry={entry} />
      )}
    </aside>
  );
}

function Header(props: { entry: WirePlanEntryRow; onClose: () => void }): ReactElement {
  return (
    <header className="flex items-start justify-between mb-4">
      <div>
        <h2 className="text-lg font-semibold">
          <Link
            to={`/food/recipes/${props.entry.recipeSlug}`}
            className="underline-offset-2 hover:underline"
          >
            {props.entry.recipeTitle}
          </Link>
        </h2>
        <p className="text-sm text-muted-foreground">
          {props.entry.date} — {props.entry.slot}
        </p>
      </div>
      <Button variant="ghost" size="sm" onClick={props.onClose} aria-label="Close edit sheet">
        ×
      </Button>
    </header>
  );
}

interface EditableBodyProps {
  entry: WirePlanEntryRow;
  onSaved: () => void;
  onDeleted: () => void;
}

function EditableBody({ entry, onSaved, onDeleted }: EditableBodyProps): ReactElement {
  const [servings, setServings] = useState(entry.plannedServings);
  const [notes, setNotes] = useState(entry.notes ?? '');
  useEffect(() => {
    setServings(entry.plannedServings);
    setNotes(entry.notes ?? '');
  }, [entry.id, entry.plannedServings, entry.notes]);
  const edit = usePlanEntryEdit({ entryId: entry.id, onSaved, onDeleted });
  return (
    <div className="space-y-4">
      <EditableFields
        servings={servings}
        setServings={setServings}
        notes={notes}
        setNotes={setNotes}
      />
      {edit.error !== null && (
        <p className="text-sm text-destructive" role="alert">
          {edit.error}
        </p>
      )}
      <EditButtons
        recipeSlug={entry.recipeSlug}
        entryId={entry.id}
        onSave={() => edit.save(servings, notes)}
        onDelete={edit.remove}
        isSaving={edit.isSaving}
        isDeleting={edit.isDeleting}
      />
    </div>
  );
}

interface EditableFieldsProps {
  servings: number;
  setServings: (n: number) => void;
  notes: string;
  setNotes: (s: string) => void;
}

function EditableFields(props: EditableFieldsProps): ReactElement {
  return (
    <>
      <div>
        <label className="block text-sm font-medium mb-1" htmlFor="edit-servings">
          Planned servings
        </label>
        <NumberInput
          id="edit-servings"
          data-testid="edit-servings"
          min={1}
          value={props.servings}
          onChange={(e) => props.setServings(Math.max(1, Number(e.target.value)))}
        />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1" htmlFor="edit-notes">
          Notes
        </label>
        <textarea
          id="edit-notes"
          data-testid="edit-notes"
          className="w-full border rounded px-2 py-1 text-sm h-24"
          value={props.notes}
          onChange={(e) => props.setNotes(e.target.value)}
          maxLength={1000}
        />
      </div>
    </>
  );
}

interface EditButtonsProps {
  recipeSlug: string;
  entryId: number;
  onSave: () => void;
  onDelete: () => void;
  isSaving: boolean;
  isDeleting: boolean;
}

function EditButtons(props: EditButtonsProps): ReactElement {
  return (
    <div className="flex flex-col gap-2 pt-2">
      <Button asChild data-testid="mark-cooked">
        <Link to={`/food/recipes/${props.recipeSlug}?cook=${props.entryId}`}>Mark cooked</Link>
      </Button>
      <Button onClick={props.onSave} variant="outline" disabled={props.isSaving}>
        Save changes
      </Button>
      <Button
        onClick={props.onDelete}
        variant="destructive"
        disabled={props.isDeleting}
        data-testid="delete-plan-entry"
      >
        Delete
      </Button>
    </div>
  );
}

function CookedBody({ entry }: { entry: WirePlanEntryRow }): ReactElement {
  return (
    <div className="space-y-3 text-sm">
      <p className="text-muted-foreground">
        Cooked on <span className="font-medium">{entry.recipeRunCookedAt ?? 'unknown'}</span>
      </p>
      <p>Planned servings: {entry.plannedServings}</p>
      {entry.notes !== null && <p>Notes: {entry.notes}</p>}
      <Link
        to={`/food/recipes/${entry.recipeSlug}/runs/${entry.recipeRunId ?? ''}`}
        className="underline text-sm"
      >
        View cook record
      </Link>
    </div>
  );
}
