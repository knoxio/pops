import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';

import { PillarCallError } from '../client/errors.js';
import { pillar } from '../client/factory.js';
import { usePillarSdkOptions } from './provider.js';
import { pillarQueryKey } from './query-key.js';

import type {
  UseMutationOptions,
  UseMutationResult,
  UseQueryOptions,
  UseQueryResult,
} from '@tanstack/react-query';

import type { CallFailure, CallResult } from '../client/errors.js';

type ProcedurePath = readonly [string, ...string[]];

type FailureFlags = {
  isContractMismatch: boolean;
  isUnavailable: boolean;
  isDegraded: boolean;
};

const NO_FAILURE: FailureFlags = {
  isContractMismatch: false,
  isUnavailable: false,
  isDegraded: false,
};

function failureFlagsFrom(failure: CallFailure): FailureFlags {
  return {
    isContractMismatch: failure.kind === 'contract-mismatch',
    isUnavailable: failure.kind === 'unavailable',
    isDegraded: failure.kind === 'degraded',
  };
}

function callProcedure<TOutput>(
  pillarId: string,
  path: ProcedurePath,
  input: unknown,
  options: ReturnType<typeof usePillarSdkOptions>
): Promise<CallResult<TOutput>> {
  const handle = pillar<unknown>(pillarId, options);
  let node: unknown = handle;
  for (let i = 0; i < path.length - 1; i += 1) {
    const segment = path[i] as string;
    node = (node as Record<string, unknown>)[segment];
  }
  const leaf = (node as Record<string, unknown>)[path[path.length - 1] as string];
  if (typeof leaf !== 'function') {
    throw new PillarCallError(pillarId, {
      kind: 'contract-mismatch',
      pillar: pillarId,
      actual: path.join('.'),
    });
  }
  return (leaf as (i: unknown) => Promise<CallResult<TOutput>>)(input);
}

export type UsePillarQueryOptions<TOutput> = Omit<
  UseQueryOptions<TOutput, PillarCallError, TOutput, readonly unknown[]>,
  'queryKey' | 'queryFn'
>;

export type UsePillarQueryResult<TOutput> = UseQueryResult<TOutput, PillarCallError> & FailureFlags;

/**
 * React Query hook that wraps a `pillar(pillarId).path(input)` call.
 *
 * The underlying call uses `.orThrow()` semantics so React Query owns
 * retry / error surfaces. Failure discriminants from `CallResult` are
 * also mapped onto convenience flags (`isContractMismatch`,
 * `isUnavailable`, `isDegraded`) so call sites can branch without
 * unpacking the `PillarCallError`.
 *
 * Cache key is `pillarQueryKey(pillarId, path, input)`.
 */
export function usePillarQuery<TOutput>(
  pillarId: string,
  path: ProcedurePath,
  input: unknown,
  options: UsePillarQueryOptions<TOutput> = {}
): UsePillarQueryResult<TOutput> {
  const sdkOptions = usePillarSdkOptions();
  const queryKey = pillarQueryKey(pillarId, path, input);

  const query = useQuery<TOutput, PillarCallError, TOutput, readonly unknown[]>({
    queryKey,
    queryFn: async () => {
      const result = await callProcedure<TOutput>(pillarId, path, input, sdkOptions);
      if (result.kind === 'ok') return result.value;
      throw new PillarCallError(pillarId, result);
    },
    ...options,
  });

  const flags =
    query.error instanceof PillarCallError ? failureFlagsFrom(query.error.result) : NO_FAILURE;

  return { ...query, ...flags } as UsePillarQueryResult<TOutput>;
}

export type UsePillarMutationOptions<TInput, TOutput, TContext = unknown> = Omit<
  UseMutationOptions<TOutput, PillarCallError, TInput, TContext>,
  'mutationFn'
>;

export type UsePillarMutationResult<TInput, TOutput, TContext = unknown> = UseMutationResult<
  TOutput,
  PillarCallError,
  TInput,
  TContext
> &
  FailureFlags;

/**
 * React Query hook that wraps a `pillar(pillarId).path(input)` mutation.
 *
 * On success, the mutation invalidates every query under the same router
 * prefix (`[pillarId, ...path.slice(0, -1)]`) — e.g. `wishlist.create`
 * invalidates `wishlist.list`, `wishlist.get`, etc. Top-level procedures
 * (single-segment paths) invalidate the entire `[pillarId]` prefix.
 *
 * Optimistic updates: pass `onMutate` to snapshot + apply optimistic
 * cache writes (typically through {@link usePillarUtils}) and return a
 * `previousData` blob. `onError` then receives that blob as its third
 * argument so callers can roll back. `onSettled` fires on both success
 * and failure paths. All four lifecycle callbacks (`onMutate`,
 * `onSuccess`, `onError`, `onSettled`) are forwarded verbatim to React
 * Query; the SDK only layers the prefix-invalidation onto `onSuccess`.
 *
 * The third generic, `TContext`, types the value returned from
 * `onMutate` (i.e. the rollback blob) so the call site doesn't have to
 * cast inside `onError`.
 */
export function usePillarMutation<TInput = unknown, TOutput = unknown, TContext = unknown>(
  pillarId: string,
  path: ProcedurePath,
  options: UsePillarMutationOptions<TInput, TOutput, TContext> = {}
): UsePillarMutationResult<TInput, TOutput, TContext> {
  const sdkOptions = usePillarSdkOptions();
  const queryClient = useQueryClient();
  const { onSuccess, ...rest } = options;

  const handleSuccess = useCallback<
    NonNullable<UseMutationOptions<TOutput, PillarCallError, TInput, TContext>['onSuccess']>
  >(
    (data, variables, onMutateResult, context) => {
      const routerPrefix = path.length > 1 ? [pillarId, ...path.slice(0, -1)] : [pillarId];
      void queryClient.invalidateQueries({ queryKey: routerPrefix });
      return onSuccess?.(data, variables, onMutateResult, context);
    },
    [queryClient, pillarId, path, onSuccess]
  );

  const mutation = useMutation<TOutput, PillarCallError, TInput, TContext>({
    mutationFn: async (input: TInput) => {
      const result = await callProcedure<TOutput>(pillarId, path, input, sdkOptions);
      if (result.kind === 'ok') return result.value;
      throw new PillarCallError(pillarId, result);
    },
    onSuccess: handleSuccess,
    ...rest,
  });

  const flags =
    mutation.error instanceof PillarCallError
      ? failureFlagsFrom(mutation.error.result)
      : NO_FAILURE;

  return { ...mutation, ...flags } as UsePillarMutationResult<TInput, TOutput, TContext>;
}

export type PillarUpdater<TData> = (previous: TData | undefined) => TData | undefined;

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
};

/**
 * Cache-write surface for a given pillar. Use alongside
 * {@link usePillarQuery} / {@link usePillarMutation} to drive optimistic
 * updates without hand-rolling query keys at the call site.
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

  return { setData, invalidate };
}

export type UsePillarCallDynamicQueryOptions = UsePillarQueryOptions<unknown>;
export type UsePillarCallDynamicQueryResult = UsePillarQueryResult<unknown>;
export type UsePillarCallDynamicMutationOptions = UsePillarMutationOptions<unknown, unknown>;
export type UsePillarCallDynamicMutationResult = UsePillarMutationResult<unknown, unknown>;

export type UsePillarCallDynamicQueryArgs = {
  pillarId: string;
  routerName: string;
  procName: string;
  input?: unknown;
  options?: UsePillarCallDynamicQueryOptions;
};

export type UsePillarCallDynamicMutationArgs = {
  pillarId: string;
  routerName: string;
  procName: string;
  options?: UsePillarCallDynamicMutationOptions;
};

/**
 * Runtime-path React Query hook. Use only when `routerName` / `procName`
 * are not known at compile time (e.g. paths come from a settings
 * manifest). For statically-known paths prefer
 * {@link usePillarQuery} so call sites get end-to-end typing. Output is
 * always `unknown` because the shape cannot be inferred from a runtime
 * path; the caller is responsible for validating it.
 *
 * For mutations, see {@link usePillarCallDynamicMutation}. The two are
 * separate hooks (not a `kind`-switched single hook) so React's
 * rules-of-hooks aren't violated when call sites change their mind.
 */
export function usePillarCallDynamic(
  args: UsePillarCallDynamicQueryArgs
): UsePillarCallDynamicQueryResult {
  const path: ProcedurePath = [args.routerName, args.procName];
  return usePillarQuery<unknown>(args.pillarId, path, args.input, args.options ?? {});
}

/**
 * Mutation-mode counterpart to {@link usePillarCallDynamic}. Returns
 * `unknown` for both input and output; callers should validate the
 * input shape before invoking `mutateAsync`.
 */
export function usePillarCallDynamicMutation(
  args: UsePillarCallDynamicMutationArgs
): UsePillarCallDynamicMutationResult {
  const path: ProcedurePath = [args.routerName, args.procName];
  return usePillarMutation<unknown, unknown>(args.pillarId, path, args.options ?? {});
}
