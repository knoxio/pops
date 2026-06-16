import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';

import { unwrap } from '../../lists-api-helpers.js';
import { listArchive, listDelete, listUnarchive, listUpdate } from '../../lists-api/index.js';

import type { ListKind } from './types.js';

/**
 * List-header mutations consumed by the detail page: update (rename + change
 * kind), archive/unarchive, hard-delete. Each mutation invalidates the
 * `['lists', 'list']` query-key prefix on success so the index page +
 * detail-`get` slot rehydrate; delete additionally bounces back to `/lists`.
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

type UpdateInput = { id: number; name?: string; kind?: ListKind };
type UpdateResult = { ok: true } | { ok: false; reason: 'NotFound' };

function useDetailMutationHooks(onError: (message: string) => void) {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ['lists', 'list'] });
  const handleError = (err: Error) => onError(err.message);
  return {
    update: useMutation({
      mutationFn: async ({ id, ...body }: UpdateInput): Promise<UpdateResult> =>
        unwrap(await listUpdate({ path: { id }, body })),
      onSuccess: () => void invalidate(),
      onError: handleError,
    }),
    archive: useMutation({
      mutationFn: async ({ id }: { id: number }) => unwrap(await listArchive({ path: { id } })),
      onSuccess: () => void invalidate(),
      onError: handleError,
    }),
    unarchive: useMutation({
      mutationFn: async ({ id }: { id: number }) => unwrap(await listUnarchive({ path: { id } })),
      onSuccess: () => void invalidate(),
      onError: handleError,
    }),
    del: useMutation({
      mutationFn: async ({ id }: { id: number }) => unwrap(await listDelete({ path: { id } })),
      onSuccess: () => void invalidate(),
      onError: handleError,
    }),
  };
}

export function useDetailMutations(): DetailMutations {
  const { t } = useTranslation('lists');
  const navigate = useNavigate();
  const [errorMessage, setError] = useState<string | null>(null);
  const clearError = useCallback(() => setError(null), []);
  const mutations = useDetailMutationHooks(setError);

  const update: DetailMutations['update'] = useCallback(
    async (id, patch) =>
      mapUpdate({ mutateAsync: mutations.update.mutateAsync, id, patch, setError }),
    [mutations.update]
  );
  const archive = useCallback(
    async (id: number) => {
      await mutations.archive.mutateAsync({ id });
    },
    [mutations.archive]
  );
  const unarchive = useCallback(
    async (id: number) => {
      await mutations.unarchive.mutateAsync({ id });
    },
    [mutations.unarchive]
  );
  const remove = useCallback(
    async (id: number) => {
      await mutations.del.mutateAsync({ id });
      await navigate('/lists');
    },
    [mutations.del, navigate]
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

type UpdateAsync = (input: UpdateInput) => Promise<UpdateResult>;

interface MapUpdateArgs {
  mutateAsync: UpdateAsync;
  id: number;
  patch: { name?: string; kind?: ListKind };
  setError: (message: string) => void;
}

async function mapUpdate(
  args: MapUpdateArgs
): Promise<{ ok: true } | { ok: false; reason: 'NotFound' | 'NameRequired' }> {
  const { mutateAsync, id, patch, setError } = args;
  try {
    const result = await mutateAsync({ id, ...patch });
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown';
    if (/NameRequired/i.test(message)) return { ok: false, reason: 'NameRequired' };
    setError(message);
    throw err;
  }
}
