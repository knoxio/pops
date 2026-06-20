import { useQuery } from '@tanstack/react-query';
import { useEffect, useState, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router';

import { listGet } from '../lists-api/index.js';
import { ShoppingDetailContent } from './components/shopping/ShoppingDetailContent.js';
import { GenericDetailContent } from './detail/GenericDetailContent.js';
import { useDetailMutations } from './detail/useDetailMutations.js';
import { useItemMutations } from './detail/useItemMutations.js';

import type { DetailContentProps, DialogState } from './detail/detail-handlers.js';
import type { ListItemRow, ListRow } from './detail/types.js';

export type ListDetailPayload = { list: ListRow; items: readonly ListItemRow[] } | null;

export function listDetailQueryKey(id: number): readonly unknown[] {
  return ['lists', 'list', 'get', { id }];
}

/**
 * `/lists/:id` — generic list detail page (PRD-140-C) with PRD-141's
 * shopping dispatch.
 *
 * The page shell fetches `lists.list.get` (polling every 60s while
 * visible) and owns the edit + delete dialog state. The body branches
 * by `list.kind`: `shopping` → `ShoppingDetailContent` (sort dropdown,
 * uncheck-all / clear-checked, denser rows, swipe-to-delete); every
 * other kind → `GenericDetailContent`. Future kind-specific paths
 * (todo, packing) layer in the same way without touching this file.
 */
export function ListDetailPage(): ReactElement {
  const { id } = useParams<{ id: string }>();
  const parsed = id !== undefined ? Number(id) : NaN;
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return <NotFoundShell />;
  }
  return <ListDetailBody listId={parsed} />;
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
  const query = useQuery<ListDetailPayload>({
    queryKey: listDetailQueryKey(listId),
    queryFn: async () => {
      const { data, error } = await listGet({ path: { id: listId } });
      if (error !== undefined) {
        const message =
          typeof error === 'object' && error !== null && 'message' in error
            ? String((error as { message: unknown }).message)
            : 'request failed';
        throw new Error(message);
      }
      return data ?? null;
    },
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
  });
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

  const props: DetailContentProps = {
    list: query.data.list,
    items: query.data.items,
    detailMx,
    itemMx,
    dialogs,
  };
  if (props.list.kind === 'shopping') return <ShoppingDetailContent {...props} />;
  return <GenericDetailContent {...props} />;
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
