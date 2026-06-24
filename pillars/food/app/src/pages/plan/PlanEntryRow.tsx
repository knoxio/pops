/**
 * One row per plan entry inside a cell: a servings badge, a status chip when
 * cooked, and a drag handle that greys out when the entry is locked by a
 * cook. Clicking the row body opens `PlanEntryEditSheet`.
 *
 * Spec: pillars/food/docs/prds/planning-page
 */
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

import { Badge } from '@pops/ui';

import type { ReactElement } from 'react';

import type { WirePlanEntryRow } from './plan-wire-types.js';

const TITLE_MAX = 18;

export interface PlanEntryRowProps {
  entry: WirePlanEntryRow;
  onEdit: (entryId: number) => void;
}

export function PlanEntryRow({ entry, onEdit }: PlanEntryRowProps): ReactElement {
  const locked = entry.recipeRunId !== null;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: entry.id,
    disabled: locked,
  });
  const title = truncate(entry.recipeTitle, TITLE_MAX);
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-1 rounded border bg-card px-1.5 py-1 text-xs cursor-pointer"
      data-testid={`plan-entry-${entry.id}`}
      onClick={(e) => {
        if ((e.target as HTMLElement).dataset.draghandle === 'true') return;
        onEdit(entry.id);
      }}
    >
      <span
        data-draghandle="true"
        className={`cursor-grab text-muted-foreground ${locked ? 'opacity-30 cursor-not-allowed' : ''}`}
        title={locked ? 'Cooked entries cannot be moved' : 'Drag to reorder'}
        {...attributes}
        {...listeners}
      >
        ⋮⋮
      </span>
      <span className="flex-1 truncate" title={entry.recipeTitle}>
        {title}
      </span>
      {entry.plannedServings > 1 && (
        <Badge variant="outline" data-testid={`servings-badge-${entry.id}`}>
          ×{entry.plannedServings}
        </Badge>
      )}
      {locked && (
        <Badge variant="secondary" data-testid={`cooked-chip-${entry.id}`}>
          cooked
        </Badge>
      )}
    </div>
  );
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}
