/**
 * A single location section (Pantry / Fridge / Freezer / Other) — PRD-147.
 *
 * Collapsible header + per-ingredient sub-groups of batch rows.
 */
import { type ReactElement } from 'react';

import { BatchRow, type BatchAction } from './BatchRow.js';

import type { BatchLocation, BatchUnit } from '../../food-api-shared-types.js';
import type { FridgeViewResponses } from '../../food-api/types.gen.js';

type FridgeLocationSection = FridgeViewResponses[200]['sections'][number];

const LOCATION_LABELS: Record<BatchLocation, string> = {
  pantry: 'Pantry',
  fridge: 'Fridge',
  freezer: 'Freezer',
  other: 'Other',
};

interface LocationSectionViewProps {
  section: FridgeLocationSection;
  collapsed: boolean;
  onToggle: () => void;
  onAction: (action: BatchAction, batchId: number, unit: BatchUnit) => void;
}

export function LocationSectionView({
  section,
  collapsed,
  onToggle,
  onAction,
}: LocationSectionViewProps): ReactElement {
  return (
    <section aria-labelledby={`fridge-section-${section.location}`}>
      <button
        type="button"
        className="flex w-full items-center gap-2 border-b py-1 text-left text-sm font-semibold"
        onClick={onToggle}
        aria-expanded={!collapsed}
      >
        <span aria-hidden="true">{collapsed ? '▸' : '▾'}</span>
        <span id={`fridge-section-${section.location}`}>
          {LOCATION_LABELS[section.location]} ({section.count})
        </span>
      </button>
      {!collapsed && section.ingredients.length > 0 && (
        <ul className="space-y-3 pt-2">
          {section.ingredients.map((group) => (
            <li key={group.ingredientId} className="space-y-1">
              <h3 className="text-xs font-medium text-muted-foreground">{group.ingredientName}</h3>
              <ul className="space-y-1">
                {group.batches.map((batch) => (
                  <BatchRow
                    key={batch.id}
                    batch={batch}
                    ingredientName={group.ingredientName}
                    onAction={(action, id) => onAction(action, id, batch.unit)}
                  />
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
