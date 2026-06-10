/**
 * `ShortfallRow` — PRD-146 + PRD-149.
 *
 * One row per unresolved shortfall. Surfaces the three resolution
 * radios (`batch-override`, `external`, `partial`) plus the
 * `BatchOverridePicker` mount when the user opts for a batch.
 *
 * `partial` mode adds `Batch qty` + `External qty` number inputs so the
 * user can split the need; defaults are `consumeQty = available`,
 * `externalQty = needed - available`.
 *
 * PRD-149 — when the user picks from the Substitutions section, the
 * resolution carries `substitutionEdgeId` and `consumeQty` is computed
 * from `lineQty × ratio` (capped at the chosen batch's remaining qty).
 */
import { useState } from 'react';

import { BatchOverridePicker, type BatchPickerSelection } from './BatchOverridePicker.js';
import { formatUnit } from './cook-format.js';
import { PartialQtyEditor, ResolutionRadios, RowHeader } from './shortfall-row-parts.js';

import type { ReactNode } from 'react';

import type {
  BatchForConsumeRow,
  LineConsumeNeed,
  LineResolution,
  LineShortfall,
} from '@pops/app-food-db';

import type { SubCandidate, SubCandidateBatch } from './useSubstitutionResolution.js';

type Kind = LineResolution['kind'];

interface PickerMode {
  open: boolean;
  forKind: 'batch-override' | 'partial';
}

export interface ShortfallRowProps {
  shortfall: LineShortfall;
  need: LineConsumeNeed;
  recipeVersionId: number;
  resolution: LineResolution | undefined;
  onResolve: (resolution: LineResolution) => void;
}

function defaultPartialFor(shortfall: LineShortfall, batch: BatchForConsumeRow): LineResolution {
  const consumeQty = Math.min(batch.qtyRemaining, shortfall.available);
  const externalQty = Math.max(0, shortfall.needed - consumeQty);
  return { kind: 'partial', batchId: batch.id, consumeQty, externalQty };
}

function defaultBatchOverrideFor(
  shortfall: LineShortfall,
  batch: BatchForConsumeRow
): LineResolution {
  const consumeQty = Math.min(batch.qtyRemaining, shortfall.needed);
  return { kind: 'batch-override', batchId: batch.id, consumeQty };
}

function substitutionPartialFor(
  shortfall: LineShortfall,
  need: LineConsumeNeed,
  candidate: SubCandidate,
  batch: SubCandidateBatch
): LineResolution {
  const required = need.qty * candidate.ratio;
  const consumeQty = Math.min(batch.qtyRemaining, required, shortfall.available || required);
  const externalQty = Math.max(0, shortfall.needed - consumeQty);
  return {
    kind: 'partial',
    batchId: batch.batchId,
    consumeQty,
    externalQty,
    substitutionEdgeId: candidate.substitutionId,
  };
}

function substitutionBatchOverrideFor(
  need: LineConsumeNeed,
  candidate: SubCandidate,
  batch: SubCandidateBatch
): LineResolution {
  const required = need.qty * candidate.ratio;
  const consumeQty = Math.min(batch.qtyRemaining, required);
  return {
    kind: 'batch-override',
    batchId: batch.batchId,
    consumeQty,
    substitutionEdgeId: candidate.substitutionId,
  };
}

export function ShortfallRow(props: ShortfallRowProps): ReactNode {
  const { shortfall, need, recipeVersionId, resolution, onResolve } = props;
  const [picker, setPicker] = useState<PickerMode>({ open: false, forKind: 'batch-override' });

  const unit = formatUnit(shortfall.unit);
  const currentKind: Kind | undefined = resolution?.kind;

  function selectKind(kind: Kind): void {
    if (kind === 'external' || kind === 'fifo') {
      onResolve({ kind });
      return;
    }
    setPicker({ open: true, forKind: kind });
  }

  function onPick(selection: BatchPickerSelection): void {
    onResolve(buildResolution(selection, shortfall, need, picker.forKind));
    setPicker({ open: false, forKind: picker.forKind });
  }

  return (
    <div className="p-3 space-y-2" data-testid={`shortfall-row-${shortfall.lineIndex}`}>
      <RowHeader shortfall={shortfall} unit={unit} />
      <ResolutionRadios shortfall={shortfall} currentKind={currentKind} onSelect={selectKind} />
      {picker.open ? (
        <BatchOverridePicker
          ingredientId={need.ingredientId}
          variantId={need.variantId}
          recipeVersionId={recipeVersionId}
          lineIndex={shortfall.lineIndex}
          linePrepStateId={need.prepStateId}
          onSelect={onPick}
          onCancel={() => setPicker((p) => ({ ...p, open: false }))}
        />
      ) : null}
      {resolution?.kind === 'partial' ? (
        <PartialQtyEditor resolution={resolution} unit={unit} onChange={onResolve} />
      ) : null}
    </div>
  );
}

function buildResolution(
  selection: BatchPickerSelection,
  shortfall: LineShortfall,
  need: LineConsumeNeed,
  forKind: 'batch-override' | 'partial'
): LineResolution {
  if (selection.kind === 'same-variant') {
    return forKind === 'partial'
      ? defaultPartialFor(shortfall, selection.batch)
      : defaultBatchOverrideFor(shortfall, selection.batch);
  }
  return forKind === 'partial'
    ? substitutionPartialFor(shortfall, need, selection.candidate, selection.batch)
    : substitutionBatchOverrideFor(need, selection.candidate, selection.batch);
}
