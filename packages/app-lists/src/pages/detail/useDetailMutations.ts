import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';

import { usePillarMutation } from '@pops/pillar-sdk/react';

import type { ListKind } from './types.js';

/**
 * List-header mutations consumed by the detail page: update (rename + change
 * kind), archive/unarchive, hard-delete. The SDK's `usePillarMutation`
 * invalidates the `['lists', 'list']` router prefix on success, which
 * covers the `list.get` cache automatically; delete additionally bounces
 * back to `/lists`.
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
type OkResult = { ok: true };
type IdInput = { id: number };

function useDetailMutationHooks(onError: (message: string) => void) {
  const handler = { onError: (err: { message: string }) => onError(err.message) };
  return {
    update: usePillarMutation<UpdateInput, UpdateResult>('lists', ['list', 'update'], handler),
    archive: usePillarMutation<IdInput, OkResult>('lists', ['list', 'archive'], handler),
    unarchive: usePillarMutation<IdInput, OkResult>('lists', ['list', 'unarchive'], handler),
    del: usePillarMutation<IdInput, OkResult>('lists', ['list', 'delete'], handler),
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
