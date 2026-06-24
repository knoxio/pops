/**
 * The `/food/fridge` page.
 *
 * Sectioned list of every non-empty, non-deleted batch grouped by
 * location, then ingredient. Row-level Edit / Relocate / Adjust /
 * Cook / Delete actions delegate to the `batches*` REST endpoints. The
 * filter / search / show-all controls feed `fridgeView`.
 */
import { useEffect, useState, type ReactElement } from 'react';
import { Link } from 'react-router';

import { Button, useDebouncedValue } from '@pops/ui';

import { AddBatchModal } from './AddBatchModal.js';
import { AdjustQtyModal } from './AdjustQtyModal.js';
import { type BatchAction } from './BatchRow.js';
import { loadCollapsed, saveCollapsed } from './collapsed-storage.js';
import { CookNowPicker } from './CookNowPicker.js';
import { DeleteBatchConfirm } from './DeleteBatchConfirm.js';
import { EditBatchModal } from './EditBatchModal.js';
import { FridgeFilterBar } from './FridgeFilterBar.js';
import { LocationSectionView } from './LocationSection.js';
import { RelocateBatchModal } from './RelocateBatchModal.js';
import { DEFAULT_FRIDGE_FILTERS, type FridgeFilterState, useFridgeView } from './useFridgeView.js';

import type { BatchLocation, BatchUnit } from '../../food-api-shared-types.js';
import type { FridgeViewResponses } from '../../food-api/types.gen.js';

type FridgeView = FridgeViewResponses[200];

const SEARCH_DEBOUNCE_MS = 200;

interface ActiveModal {
  kind: 'edit' | 'relocate' | 'adjust' | 'delete' | 'cook';
  batchId: number;
  unit: BatchUnit | null;
}

export function FridgePage(): ReactElement {
  const [filters, setFilters] = useState<FridgeFilterState>({ ...DEFAULT_FRIDGE_FILTERS });
  const debouncedSearch = useDebouncedValue(filters.search, SEARCH_DEBOUNCE_MS);
  const fridge = useFridgeView({ filters, debouncedSearch });

  const [addOpen, setAddOpen] = useState(false);
  const [active, setActive] = useState<ActiveModal | null>(null);
  const [collapsed, setCollapsed] = useState<ReadonlySet<BatchLocation>>(() => loadCollapsed());

  useEffect(() => {
    saveCollapsed(collapsed);
  }, [collapsed]);

  function toggleCollapsed(loc: BatchLocation): void {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(loc)) next.delete(loc);
      else next.add(loc);
      return next;
    });
  }

  function handleAction(action: BatchAction, batchId: number, unit: BatchUnit): void {
    setActive({ kind: action, batchId, unit });
  }

  return (
    <div className="space-y-4 p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-bold tracking-tight">Fridge</h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" asChild>
            <Link to="/food/solve">What can I cook?</Link>
          </Button>
          <Button onClick={() => setAddOpen(true)}>+ Add batch</Button>
        </div>
      </header>

      <FridgeFilterBar
        filters={filters}
        onChange={setFilters}
        hiddenCount={(fridge.data?.counts.empty ?? 0) + (fridge.data?.counts.deleted ?? 0)}
      />

      <FridgeBody
        fridge={fridge}
        showAll={filters.showAll}
        collapsed={collapsed}
        toggleCollapsed={toggleCollapsed}
        onAction={handleAction}
      />

      <ModalHost
        addOpen={addOpen}
        active={active}
        onCloseAdd={() => setAddOpen(false)}
        onCloseActive={() => setActive(null)}
      />
    </div>
  );
}

interface FridgeBodyProps {
  fridge: ReturnType<typeof useFridgeView>;
  showAll: boolean;
  collapsed: ReadonlySet<BatchLocation>;
  toggleCollapsed: (loc: BatchLocation) => void;
  onAction: (action: BatchAction, batchId: number, unit: BatchUnit) => void;
}

function FridgeBody({
  fridge,
  showAll,
  collapsed,
  toggleCollapsed,
  onAction,
}: FridgeBodyProps): ReactElement {
  if (fridge.error !== null) {
    return (
      <p
        role="alert"
        className="rounded border border-destructive/50 bg-destructive/10 p-3 text-sm"
      >
        Couldn&apos;t load the fridge: {fridge.error.message}
      </p>
    );
  }
  if (fridge.isLoading) {
    return (
      <p role="status" className="text-sm text-muted-foreground">
        Loading…
      </p>
    );
  }
  const counts = fridge.data?.counts ?? { visible: 0, empty: 0, deleted: 0 };
  if (counts.visible === 0 && !showAll) return <EmptyState />;

  return (
    <div className="space-y-4">
      {(fridge.data?.sections ?? []).map((section) => (
        <LocationSectionView
          key={section.location}
          section={section}
          collapsed={collapsed.has(section.location)}
          onToggle={() => toggleCollapsed(section.location)}
          onAction={onAction}
        />
      ))}
    </div>
  );
}

interface ModalHostProps {
  addOpen: boolean;
  active: ActiveModal | null;
  onCloseAdd: () => void;
  onCloseActive: () => void;
}

function ModalHost({ addOpen, active, onCloseAdd, onCloseActive }: ModalHostProps): ReactElement {
  const target = (kind: ActiveModal['kind']): number | null =>
    active?.kind === kind ? active.batchId : null;
  return (
    <>
      <AddBatchModal isOpen={addOpen} onClose={onCloseAdd} />
      <EditBatchModal
        batchId={target('edit')}
        isOpen={active?.kind === 'edit'}
        onClose={onCloseActive}
      />
      <RelocateBatchModal
        batchId={target('relocate')}
        isOpen={active?.kind === 'relocate'}
        onClose={onCloseActive}
      />
      <AdjustQtyModal
        batchId={target('adjust')}
        isOpen={active?.kind === 'adjust'}
        onClose={onCloseActive}
      />
      <DeleteBatchConfirm
        batchId={target('delete')}
        isOpen={active?.kind === 'delete'}
        onClose={onCloseActive}
      />
      <CookNowPicker
        batchId={target('cook')}
        batchUnit={active?.kind === 'cook' ? active.unit : null}
        isOpen={active?.kind === 'cook'}
        onClose={onCloseActive}
      />
    </>
  );
}

function EmptyState(): ReactElement {
  return (
    <div className="rounded-md border border-dashed p-10 text-center">
      <p className="text-sm">
        Nothing in the fridge yet. Click <strong>+ Add batch</strong> or cook a recipe to fill it.
      </p>
    </div>
  );
}

// Re-export the view type to keep test fixtures self-contained.
export type { FridgeView };
