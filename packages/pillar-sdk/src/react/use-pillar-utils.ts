import { useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';

import { PillarCallError } from '../client/errors.js';
import { callProcedure } from './internal/call-procedure.js';
import { usePillarSdkOptions } from './provider.js';
import { pillarQueryKey } from './query-key.js';

import type { FetchQueryOptions } from '@tanstack/react-query';

import type { ProcedurePath } from './internal/call-procedure.js';

export type PillarUpdater<TData> = (previous: TData | undefined) => TData | undefined;

export type UsePillarUtilsFetchQueryOptions<TOutput> = Omit<
  FetchQueryOptions<TOutput, PillarCallError, TOutput, readonly unknown[]>,
  'queryKey' | 'queryFn'
>;

export type UsePillarUtilsResult = {
  /**
   * Imperatively write to the cache slot keyed by
   * `pillarQueryKey(pillarId, routerPath, input)`. `updater` receives the
   * current value (or `undefined` if the slot is empty) and returns the
   * next value. Returning `undefined` removes the slot.
   *
   * Returns the snapshot of the previous value, suitable to stash in the
   * `onMutate` context for rollback.
   */
  setData: <TData>(
    routerPath: ProcedurePath,
    input: unknown,
    updater: PillarUpdater<TData>
  ) => TData | undefined;
  /**
   * Invalidate cached queries under this pillar. With no argument,
   * invalidates everything under `[pillarId]`. With `routerPath`,
   * invalidates everything under `[pillarId, ...routerPath]` — pass the
   * router prefix (e.g. `['wishlist']`) or the full procedure path
   * (e.g. `['wishlist', 'list']`).
   *
   * Returns the underlying React Query promise so callers can `await`
   * the invalidation if they want refetches to settle before continuing.
   */
  invalidate: (routerPath?: readonly string[]) => Promise<void>;
  /**
   * Imperatively fetch a query for the slot keyed by
   * `pillarQueryKey(pillarId, routerPath, input)`. Mirrors
   * `queryClient.fetchQuery` semantics: returns the cached value if it
   * is still fresh (respecting `staleTime`), otherwise issues the
   * underlying pillar call and caches the result.
   *
   * Use this for one-shot imperative reads — e.g. fetching data inside
   * an event handler — where the React Query `usePillarQuery` hook is
   * not appropriate. Rejects with a `PillarCallError` on failure.
   *
   * `opts` is forwarded to the underlying `queryClient.fetchQuery`,
   * minus `queryKey` and `queryFn` which are derived from `routerPath`
   * + `input`.
   */
  fetchQuery: <TOutput>(
    routerPath: ProcedurePath,
    input: unknown,
    opts?: UsePillarUtilsFetchQueryOptions<TOutput>
  ) => Promise<TOutput>;
};

/**
 * Cache-write surface for a given pillar. Use alongside
 * `usePillarQuery` / `usePillarMutation` to drive optimistic updates
 * without hand-rolling query keys at the call site, and to issue
 * imperative one-shot reads through `fetchQuery`.
 *
 * Typical optimistic-update flow:
 * ```ts
 * const utils = usePillarUtils('media');
 * usePillarMutation<Input, Output, { previous: Item[] | undefined }>(
 *   'media',
 *   ['watchlist', 'toggle'],
 *   {
 *     onMutate: (vars) => {
 *       const previous = utils.setData<Item[]>(
 *         ['watchlist', 'list'],
 *         { limit: 10 },
 *         (prev) => applyToggle(prev, vars)
 *       );
 *       return { previous };
 *     },
 *     onError: (_err, _vars, ctx) => {
 *       utils.setData(['watchlist', 'list'], { limit: 10 }, () => ctx?.previous);
 *     },
 *   }
 * );
 * ```
 */
export function usePillarUtils(pillarId: string): UsePillarUtilsResult {
  const queryClient = useQueryClient();
  const sdkOptions = usePillarSdkOptions();

  const setData = useCallback(
    <TData>(
      routerPath: ProcedurePath,
      input: unknown,
      updater: PillarUpdater<TData>
    ): TData | undefined => {
      const key = pillarQueryKey(pillarId, routerPath, input);
      const previous = queryClient.getQueryData<TData>(key);
      const next = updater(previous);
      queryClient.setQueryData<TData>(key, next);
      return previous;
    },
    [queryClient, pillarId]
  );

  const invalidate = useCallback(
    async (routerPath?: readonly string[]): Promise<void> => {
      const queryKey = routerPath && routerPath.length > 0 ? [pillarId, ...routerPath] : [pillarId];
      await queryClient.invalidateQueries({ queryKey });
    },
    [queryClient, pillarId]
  );

  const fetchQuery = useCallback(
    <TOutput>(
      routerPath: ProcedurePath,
      input: unknown,
      opts?: UsePillarUtilsFetchQueryOptions<TOutput>
    ): Promise<TOutput> => {
      const queryKey = pillarQueryKey(pillarId, routerPath, input);
      return queryClient.fetchQuery<TOutput, PillarCallError, TOutput, readonly unknown[]>({
        ...opts,
        queryKey,
        queryFn: async () => {
          const result = await callProcedure<TOutput>(pillarId, routerPath, input, sdkOptions);
          if (result.kind === 'ok') return result.value;
          throw new PillarCallError(pillarId, result);
        },
      });
    },
    [queryClient, pillarId, sdkOptions]
  );

  return { setData, invalidate, fetchQuery };
}
