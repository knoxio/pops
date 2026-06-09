import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';

import { trpc } from '@pops/api-client';

import type { ListKind } from './types.js';

/**
 * List-header mutations consumed by the detail page: update (rename + change
 * kind), archive/unarchive, hard-delete. Each mutation invalidates the
 * single-list `lists.list.get` cache so the page reflects the change without
 * a manual refetch; delete additionally bounces back to `/lists`.
 */
export interface DetailMutations {
  update: (
    id: number,
    patch: { name?: string; kind?: ListKind }
  ) => Promise<{ ok: true } | { ok: false; reason: 'NotFound' | 'NameRequired' }>;
  isUpdating: boolean;
  archive: (id: number) => Promise<void>;
  unarchive: (id: number) => Promise<void>;
  remove: (id: number) => Promise<void>;
  isRemoving: boolean;
  errorMessage: string | null;
  clearError: () => void;
}

function useDetailMutationHooks(onError: (message: string) => void) {
  const handler = { onError: (err: { message: string }) => onError(err.message) };
  return {
    update: trpc.lists.list.update.useMutation(handler),
    archive: trpc.lists.list.archive.useMutation(handler),
    unarchive: trpc.lists.list.unarchive.useMutation(handler),
    del: trpc.lists.list.delete.useMutation(handler),
  };
}

export function useDetailMutations(): DetailMutations {
  const { t } = useTranslation('lists');
  const navigate = useNavigate();
  const utils = trpc.useUtils();
  const [errorMessage, setError] = useState<string | null>(null);
  const clearError = useCallback(() => setError(null), []);
  const mutations = useDetailMutationHooks(setError);

  const update: DetailMutations['update'] = useCallback(
    async (id, patch) =>
      mapUpdate({ mutateAsync: mutations.update.mutateAsync, id, patch, utils, setError }),
    [mutations.update, utils]
  );
  const archive = useCallback(
    async (id: number) => {
      await mutations.archive.mutateAsync({ id });
      await utils.lists.list.get.invalidate({ id });
    },
    [mutations.archive, utils]
  );
  const unarchive = useCallback(
    async (id: number) => {
      await mutations.unarchive.mutateAsync({ id });
      await utils.lists.list.get.invalidate({ id });
    },
    [mutations.unarchive, utils]
  );
  const remove = useCallback(
    async (id: number) => {
      await mutations.del.mutateAsync({ id });
      await utils.lists.list.get.invalidate({ id });
      await navigate('/lists');
    },
    [mutations.del, navigate, utils]
  );

  return {
    update,
    isUpdating: mutations.update.isPending,
    archive,
    unarchive,
    remove,
    isRemoving: mutations.del.isPending,
    errorMessage: errorMessage ?? (mutations.update.error ? t('detail.errors.update') : null),
    clearError,
  };
}

type UpdateAsync = ReturnType<typeof trpc.lists.list.update.useMutation>['mutateAsync'];

interface MapUpdateArgs {
  mutateAsync: UpdateAsync;
  id: number;
  patch: { name?: string; kind?: ListKind };
  utils: ReturnType<typeof trpc.useUtils>;
  setError: (message: string) => void;
}

async function mapUpdate(
  args: MapUpdateArgs
): Promise<{ ok: true } | { ok: false; reason: 'NotFound' | 'NameRequired' }> {
  const { mutateAsync, id, patch, utils, setError } = args;
  try {
    const result = await mutateAsync({ id, ...patch });
    if (result.ok) await utils.lists.list.get.invalidate({ id });
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown';
    if (/NameRequired/i.test(message)) return { ok: false, reason: 'NameRequired' };
    setError(message);
    throw err;
  }
}
