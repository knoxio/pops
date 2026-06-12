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

export type UsePillarMutationOptions<TInput, TOutput> = Omit<
  UseMutationOptions<TOutput, PillarCallError, TInput>,
  'mutationFn'
>;

export type UsePillarMutationResult<TInput, TOutput> = UseMutationResult<
  TOutput,
  PillarCallError,
  TInput
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
 * Pass `options.onSuccess` to layer additional behaviour; the built-in
 * invalidation runs first. The hook does not maintain its own cache —
 * only the mutation lifecycle (pending / error) plus the failure-flag
 * mapping.
 */
export function usePillarMutation<TInput = unknown, TOutput = unknown>(
  pillarId: string,
  path: ProcedurePath,
  options: UsePillarMutationOptions<TInput, TOutput> = {}
): UsePillarMutationResult<TInput, TOutput> {
  const sdkOptions = usePillarSdkOptions();
  const queryClient = useQueryClient();
  const { onSuccess, ...rest } = options;

  const handleSuccess = useCallback<
    NonNullable<UseMutationOptions<TOutput, PillarCallError, TInput>['onSuccess']>
  >(
    (data, variables, onMutateResult, context) => {
      const routerPrefix = path.length > 1 ? [pillarId, ...path.slice(0, -1)] : [pillarId];
      void queryClient.invalidateQueries({ queryKey: routerPrefix });
      return onSuccess?.(data, variables, onMutateResult, context);
    },
    [queryClient, pillarId, path, onSuccess]
  );

  const mutation = useMutation<TOutput, PillarCallError, TInput>({
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

  return { ...mutation, ...flags } as UsePillarMutationResult<TInput, TOutput>;
}
