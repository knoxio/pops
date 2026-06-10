import { useState, type ReactElement } from 'react';

import { useDetailHandlers, type DetailContentProps } from '../../detail/detail-handlers.js';
import { ErrorBanners } from '../../detail/GenericDetailContent.js';
import { ListDeleteDialog } from '../../detail/ListDeleteDialog.js';
import { ListEditModal } from '../../detail/ListEditModal.js';
import { ClearCheckedDialog } from './ClearCheckedDialog.js';
import { ShoppingAddForm } from './ShoppingAddForm.js';
import { ShoppingDetailHeader } from './ShoppingDetailHeader.js';
import { ShoppingItemsSection } from './ShoppingItemsSection.js';
import { UncheckAllDialog } from './UncheckAllDialog.js';
import {
  useShoppingBulkMutations,
  type ShoppingBulkMutations,
} from './useShoppingBulkMutations.js';
import { useShoppingSort, type ShoppingSort } from './useShoppingSort.js';

/**
 * `/lists/:id` rendered for `kind === 'shopping'` (PRD-141). Composes the
 * shopping header (sort dropdown + bulk actions), shopping items section
 * (denser rows + drag-disabled when sort != Manual), and shopping add
 * form on top of the same edit/delete dialogs used by the generic body
 * (PRD-140-C — those modals are kind-agnostic).
 */
export function ShoppingDetailContent(props: DetailContentProps): ReactElement {
  const { list, items, detailMx, itemMx } = props;
  const h = useDetailHandlers(props);
  const sort = useShoppingSort(items);
  const bulk = useShoppingBulkMutations(list.id);
  const [uncheckAllOpen, setUncheckAllOpen] = useState(false);
  const [clearCheckedOpen, setClearCheckedOpen] = useState(false);

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <ShoppingHeaderRow
        props={props}
        sort={sort}
        h={h}
        onUncheckAll={() => setUncheckAllOpen(true)}
        onClearChecked={() => setClearCheckedOpen(true)}
      />
      <ErrorBanners
        detail={detailMx.errorMessage ?? bulk.errorMessage}
        item={itemMx.errorMessage}
      />
      <ShoppingItemsSection
        items={sort.sortedItems}
        isDragDisabled={sort.isDragDisabled}
        onToggleChecked={h.toggleChecked}
        onSaveLabel={(id, label) => itemMx.update(id, { label })}
        onReorder={itemMx.reorder}
        onDelete={itemMx.remove}
      />
      <ShoppingAddForm
        isPending={itemMx.isAdding}
        onAdd={async (input) => (await itemMx.add(input)) !== null}
      />
      <ShoppingDialogs
        props={props}
        h={h}
        bulk={bulk}
        uncheckAllOpen={uncheckAllOpen}
        clearCheckedOpen={clearCheckedOpen}
        onCloseUncheckAll={() => setUncheckAllOpen(false)}
        onCloseClearChecked={() => setClearCheckedOpen(false)}
      />
    </div>
  );
}

function ShoppingHeaderRow({
  props,
  sort,
  h,
  onUncheckAll,
  onClearChecked,
}: {
  props: DetailContentProps;
  sort: ShoppingSort;
  h: ReturnType<typeof useDetailHandlers>;
  onUncheckAll: () => void;
  onClearChecked: () => void;
}) {
  return (
    <ShoppingDetailHeader
      list={props.list}
      items={props.items}
      sortMode={sort.mode}
      onSortChange={sort.setMode}
      onUncheckAll={onUncheckAll}
      onClearChecked={onClearChecked}
      onRename={props.dialogs.openEdit}
      onChangeKind={props.dialogs.openEdit}
      onArchiveToggle={() => void h.archiveToggle()}
      onDelete={props.dialogs.openDelete}
    />
  );
}

interface ShoppingDialogsProps {
  props: DetailContentProps;
  h: ReturnType<typeof useDetailHandlers>;
  bulk: ShoppingBulkMutations;
  uncheckAllOpen: boolean;
  clearCheckedOpen: boolean;
  onCloseUncheckAll: () => void;
  onCloseClearChecked: () => void;
}

function ShoppingDialogs(args: ShoppingDialogsProps) {
  const checkedCount = args.props.items.filter((row) => row.checked === 1).length;
  return (
    <>
      <CoreModals args={args} />
      <BulkConfirmModals args={args} checkedCount={checkedCount} />
    </>
  );
}

function CoreModals({ args }: { args: ShoppingDialogsProps }) {
  const { props, h } = args;
  const { list, items, detailMx, dialogs } = props;
  if (dialogs.editOpen) {
    return (
      <ListEditModal
        list={list}
        isSaving={detailMx.isUpdating}
        onCancel={dialogs.closeEdit}
        onSave={(patch) => void h.saveEdit(patch)}
        onArchiveToggle={() => {
          void h.archiveToggle();
          dialogs.closeEdit();
        }}
      />
    );
  }
  if (dialogs.deleteOpen) {
    return (
      <ListDeleteDialog
        name={list.name}
        itemCount={items.length}
        isPending={detailMx.isRemoving}
        onCancel={dialogs.closeDelete}
        onConfirm={() => void h.confirmDelete()}
      />
    );
  }
  return null;
}

function BulkConfirmModals({
  args,
  checkedCount,
}: {
  args: ShoppingDialogsProps;
  checkedCount: number;
}) {
  const { bulk, uncheckAllOpen, clearCheckedOpen, onCloseUncheckAll, onCloseClearChecked } = args;
  const onConfirmUncheckAll = async () => {
    await bulk.uncheckAll();
    onCloseUncheckAll();
  };
  const onConfirmClearChecked = async () => {
    await bulk.removeChecked();
    onCloseClearChecked();
  };
  return (
    <>
      {uncheckAllOpen ? (
        <UncheckAllDialog
          checkedCount={checkedCount}
          isPending={bulk.isUnchecking}
          onCancel={onCloseUncheckAll}
          onConfirm={() => void onConfirmUncheckAll()}
        />
      ) : null}
      {clearCheckedOpen ? (
        <ClearCheckedDialog
          checkedCount={checkedCount}
          isPending={bulk.isRemoving}
          onCancel={onCloseClearChecked}
          onConfirm={() => void onConfirmClearChecked()}
        />
      ) : null}
    </>
  );
}
