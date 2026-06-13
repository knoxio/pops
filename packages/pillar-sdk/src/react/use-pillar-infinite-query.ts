import { useInfiniteQuery } from '@tanstack/react-query';

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
  InfiniteData,
  QueryFunctionContext,
  UseInfiniteQueryOptions,
  UseInfiniteQueryResult,
} from '@tanstack/react-query';

import type { FailureFlags } from './internal/call-procedure.js';

/**
 * Adapter that produces the per-page input from the user-supplied `input`
 * and the React Query `pageParam`. Defaults to
 * `{ ...input, cursor: pageParam }` when `input` is an object, otherwise
 * `{ cursor: pageParam }`.
 */
export type PillarInfiniteBuildInput<TPageParam> = (
  input: unknown,
  pageParam: TPageParam
) => unknown;

export type UsePillarInfiniteQueryOptions<TOutput, TPageParam> = Omit<
  UseInfiniteQueryOptions<
    TOutput,
    PillarCallError,
    InfiniteData<TOutput, TPageParam>,
    readonly unknown[],
    TPageParam
  >,
  'queryKey' | 'queryFn'
> & {
  buildInput?: PillarInfiniteBuildInput<TPageParam>;
};

export type UsePillarInfiniteQueryResult<TOutput, TPageParam> = UseInfiniteQueryResult<
  InfiniteData<TOutput, TPageParam>,
  PillarCallError
> &
  FailureFlags;

const defaultBuildInput: PillarInfiniteBuildInput<unknown> = (input, pageParam) => {
  if (input !== null && typeof input === 'object' && !Array.isArray(input)) {
    return { ...(input as Record<string, unknown>), cursor: pageParam };
  }
  return { cursor: pageParam };
};

/**
 * React Query hook that wraps a paginated `pillar(pillarId).path(input)` call.
 *
 * Mirrors `useInfiniteQuery` from `@tanstack/react-query`, typed through
 * the pillar contract. Each page invokes the procedure with input derived
 * from `buildInput(input, pageParam)`. The default `buildInput` spreads
 * `input` and overrides `cursor` with the page param — appropriate for
 * the common `{ cursor, limit }` cursor-pagination shape. Override
 * `buildInput` to use a different field name (e.g. `offset`, `nextToken`).
 *
 * `initialPageParam` and `getNextPageParam` are required by React Query
 * and forwarded verbatim. Cache key matches `pillarQueryKey(pillarId,
 * path, input)` — note that pageParam does not participate in the key;
 * it is part of the per-page request body instead.
 */
export function usePillarInfiniteQuery<TOutput, TPageParam = unknown>(
  pillarId: string,
  path: ProcedurePath,
  input: unknown,
  options: UsePillarInfiniteQueryOptions<TOutput, TPageParam>
): UsePillarInfiniteQueryResult<TOutput, TPageParam> {
  const sdkOptions = usePillarSdkOptions();
  const queryKey = pillarQueryKey(pillarId, path, input);
  const { buildInput, ...rest } = options;
  const effectiveBuildInput: PillarInfiniteBuildInput<TPageParam> = buildInput ?? defaultBuildInput;

  const query = useInfiniteQuery<
    TOutput,
    PillarCallError,
    InfiniteData<TOutput, TPageParam>,
    readonly unknown[],
    TPageParam
  >({
    ...rest,
    queryKey,
    queryFn: async (ctx: QueryFunctionContext<readonly unknown[], TPageParam>) => {
      const pageParam = ctx.pageParam as TPageParam;
      const perPageInput = effectiveBuildInput(input, pageParam);
      const result = await callProcedure<TOutput>(pillarId, path, perPageInput, sdkOptions);
      if (result.kind === 'ok') return result.value;
      throw new PillarCallError(pillarId, result);
    },
  });

  const flags =
    query.error instanceof PillarCallError ? failureFlagsFrom(query.error.result) : NO_FAILURE;

  return { ...query, ...flags } as UsePillarInfiniteQueryResult<TOutput, TPageParam>;
}
