import { type ReactElement } from 'react';

import { useDetailHandlers, type DetailContentProps } from './detail-handlers.js';
import { ListDeleteDialog } from './ListDeleteDialog.js';
import { ListDetailHeader } from './ListDetailHeader.js';
import { ListEditModal } from './ListEditModal.js';
import { ListItemAddForm } from './ListItemAddForm.js';
import { ListItemsSection } from './ListItemsSection.js';

/**
 * Generic kind path for `/lists/:id` — every kind that isn't `shopping`
 * (PRD-141 dispatches `shopping` to its specialised content). Owns the
 * page body, the edit + delete dialogs, and the error banners shared
 * with the shopping path.
 */
export function GenericDetailContent(props: DetailContentProps): ReactElement {
  const { list, items, detailMx, itemMx, dialogs } = props;
  const h = useDetailHandlers(props);

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <ListDetailHeader
        list={list}
        onRename={dialogs.openEdit}
        onChangeKind={dialogs.openEdit}
        onArchiveToggle={() => void h.archiveToggle()}
        onDelete={dialogs.openDelete}
      />
      <ErrorBanners detail={detailMx.errorMessage} item={itemMx.errorMessage} />
      <ListItemsSection
        items={items}
        onToggleChecked={h.toggleChecked}
        onSaveLabel={(id, label) => itemMx.update(id, { label })}
        onReorder={itemMx.reorder}
        onDelete={itemMx.remove}
      />
      <ListItemAddForm
        isPending={itemMx.isAdding}
        onAdd={async (input) => (await itemMx.add(input)) !== null}
      />
      {dialogs.editOpen ? (
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
      ) : null}
      {dialogs.deleteOpen ? (
        <ListDeleteDialog
          name={list.name}
          itemCount={items.length}
          isPending={detailMx.isRemoving}
          onCancel={dialogs.closeDelete}
          onConfirm={() => void h.confirmDelete()}
        />
      ) : null}
    </div>
  );
}

export function ErrorBanners({
  detail,
  item,
}: {
  detail: string | null;
  item: string | null;
}): ReactElement {
  return (
    <>
      {detail !== null ? (
        <p role="alert" className="text-sm text-destructive">
          {detail}
        </p>
      ) : null}
      {item !== null ? (
        <p role="alert" className="text-sm text-destructive">
          {item}
        </p>
      ) : null}
    </>
  );
}
