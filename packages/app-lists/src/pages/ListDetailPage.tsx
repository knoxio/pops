import { useEffect, useState, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router';

import { trpc } from '@pops/api-client';

import { ListDeleteDialog } from './detail/ListDeleteDialog.js';
import { ListDetailHeader } from './detail/ListDetailHeader.js';
import { ListEditModal } from './detail/ListEditModal.js';
import { ListItemAddForm } from './detail/ListItemAddForm.js';
import { ListItemsSection } from './detail/ListItemsSection.js';
import { useDetailMutations, type DetailMutations } from './detail/useDetailMutations.js';
import { useItemMutations, type ItemMutations } from './detail/useItemMutations.js';

import type { ListItemRow, ListRow } from './detail/types.js';

/**
 * `/lists/:id` — generic list detail page (PRD-140-C).
 *
 * Renders any list kind via the kind-agnostic row component. Shopping-only
 * affordances (uncheck-all, clear-checked, sort) land in PRD-141 by
 * swapping the items section when `kind === 'shopping'`. The 60-second
 * background poll picks up concurrent edits from other tabs and from
 * food's "Send to shopping list" action (PRD-142).
 */
export function ListDetailPage(): ReactElement {
  const { id } = useParams<{ id: string }>();
  const parsed = id !== undefined ? Number(id) : NaN;
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return <NotFoundShell />;
  }
  return <ListDetailBody listId={parsed} />;
}

interface DialogState {
  editOpen: boolean;
  deleteOpen: boolean;
  openEdit: () => void;
  closeEdit: () => void;
  openDelete: () => void;
  closeDelete: () => void;
}

function useDialogs(): DialogState {
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  return {
    editOpen,
    deleteOpen,
    openEdit: () => setEditOpen(true),
    closeEdit: () => setEditOpen(false),
    openDelete: () => setDeleteOpen(true),
    closeDelete: () => setDeleteOpen(false),
  };
}

function ListDetailBody({ listId }: { listId: number }): ReactElement {
  const { t } = useTranslation('lists');
  const query = trpc.lists.list.get.useQuery(
    { id: listId },
    { refetchInterval: 60_000, refetchIntervalInBackground: false }
  );
  const detailMx = useDetailMutations();
  const itemMx = useItemMutations(listId);
  const dialogs = useDialogs();

  useEffect(() => {
    if (query.error) detailMx.clearError();
  }, [detailMx, query.error]);

  if (query.isLoading) return <Status text={t('detail.loading')} />;
  if (query.data === null) return <NotFoundShell />;
  if (query.error !== null || query.data === undefined) {
    return <Status text={t('detail.error')} variant="error" />;
  }

  return (
    <DetailContent
      list={query.data.list}
      items={query.data.items}
      detailMx={detailMx}
      itemMx={itemMx}
      dialogs={dialogs}
    />
  );
}

interface DetailContentProps {
  list: ListRow;
  items: readonly ListItemRow[];
  detailMx: DetailMutations;
  itemMx: ItemMutations;
  dialogs: DialogState;
}

function useDetailHandlers({ list, detailMx, itemMx, dialogs }: DetailContentProps) {
  return {
    toggleChecked: (id: number, currentlyChecked: boolean) => {
      if (currentlyChecked) itemMx.uncheck(id);
      else itemMx.check(id);
    },
    archiveToggle: async () => {
      if (list.archivedAt === null) await detailMx.archive(list.id);
      else await detailMx.unarchive(list.id);
    },
    saveEdit: async (patch: { name: string; kind: typeof list.kind }) => {
      const result = await detailMx.update(list.id, patch);
      if (result.ok) dialogs.closeEdit();
    },
    confirmDelete: async () => {
      await detailMx.remove(list.id);
      dialogs.closeDelete();
    },
  };
}

function DetailContent(props: DetailContentProps): ReactElement {
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
        isPending={false}
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

function ErrorBanners({
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

function Status({
  text,
  variant = 'info',
}: {
  text: string;
  variant?: 'info' | 'error';
}): ReactElement {
  return (
    <p
      className={
        variant === 'error' ? 'p-6 text-sm text-destructive' : 'p-6 text-sm text-muted-foreground'
      }
      role={variant === 'error' ? 'alert' : 'status'}
    >
      {text}
    </p>
  );
}

function NotFoundShell(): ReactElement {
  const { t } = useTranslation('lists');
  return <Status text={t('detail.notFound')} variant="error" />;
}
