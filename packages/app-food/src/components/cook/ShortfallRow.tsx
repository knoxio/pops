/**
 * `ShortfallRow` — PRD-146.
 *
 * One row per unresolved shortfall. Surfaces the three resolution
 * radios (`batch-override`, `external`, `partial`) plus the
 * `BatchOverridePicker` mount when the user opts for a batch.
 *
 * `partial` mode adds `Batch qty` + `External qty` number inputs so the
 * user can split the need; defaults are `consumeQty = available`,
 * `externalQty = needed - available`.
 */
import { useState } from 'react';

import { BatchOverridePicker } from './BatchOverridePicker.js';
import { formatUnit } from './cook-format.js';
import { PartialQtyEditor, ResolutionRadios, RowHeader } from './shortfall-row-parts.js';

import type { ReactNode } from 'react';

import type {
  BatchForConsumeRow,
  LineConsumeNeed,
  LineResolution,
  LineShortfall,
} from '@pops/app-food-db';

type Kind = LineResolution['kind'];

interface PickerMode {
  open: boolean;
  forKind: 'batch-override' | 'partial';
}

export interface ShortfallRowProps {
  shortfall: LineShortfall;
  need: LineConsumeNeed;
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

export function ShortfallRow(props: ShortfallRowProps): ReactNode {
  const { shortfall, need, resolution, onResolve } = props;
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

  function onPickBatch(batch: BatchForConsumeRow): void {
    onResolve(
      picker.forKind === 'partial'
        ? defaultPartialFor(shortfall, batch)
        : defaultBatchOverrideFor(shortfall, batch)
    );
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
          onSelect={onPickBatch}
          onCancel={() => setPicker((p) => ({ ...p, open: false }))}
        />
      ) : null}
      {resolution?.kind === 'partial' ? (
        <PartialQtyEditor resolution={resolution} unit={unit} onChange={onResolve} />
      ) : null}
    </div>
  );
}
