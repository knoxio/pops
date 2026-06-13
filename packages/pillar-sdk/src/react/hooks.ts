import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';

import { PillarCallError } from '../client/errors.js';
import {
  callProcedure,
  failureFlagsFrom,
  NO_FAILURE,
  type ProcedurePath,
} from './internal/call-procedure.js';
import { usePillarSdkOptions } from './provider.js';
import { pillarQueryKey } from './query-key.js';

import type {
  UseMutationOptions,
  UseMutationResult,
  UseQueryOptions,
  UseQueryResult,
} from '@tanstack/react-query';

import type { FailureFlags } from './internal/call-procedure.js';

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
 * cache writes (typically through `usePillarUtils`) and return a
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

export {
  usePillarUtils,
  type PillarUpdater,
  type UsePillarUtilsFetchQueryOptions,
  type UsePillarUtilsResult,
} from './use-pillar-utils.js';

export {
  usePillarInfiniteQuery,
  type PillarInfiniteBuildInput,
  type UsePillarInfiniteQueryOptions,
  type UsePillarInfiniteQueryResult,
} from './use-pillar-infinite-query.js';

export { pillarQueryArg, usePillarQueries, type PillarQueryArg } from './use-pillar-queries.js';

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
