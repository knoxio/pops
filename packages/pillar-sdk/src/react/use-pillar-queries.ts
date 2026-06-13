import { useQueries } from '@tanstack/react-query';

import { PillarCallError } from '../client/errors.js';
import {
  callProcedure,
  failureFlagsFrom,
  NO_FAILURE,
  type ProcedurePath,
} from './internal/call-procedure.js';
import { usePillarSdkOptions } from './provider.js';
import { pillarQueryKey } from './query-key.js';

import type { NetworkMode, QueryMeta } from '@tanstack/react-query';

import type { UsePillarQueryResult } from './hooks.js';

type RetryValue = boolean | number | ((failureCount: number, error: PillarCallError) => boolean);
type RetryDelayValue = number | ((failureCount: number, error: PillarCallError) => number);

declare const pillarQueryArgOutput: unique symbol;

/**
 * Per-element React Query options accepted by {@link pillarQueryArg}.
 *
 * Deliberately narrower than `UsePillarQueryOptions<TOutput>` so that
 * `PillarQueryArg<TOutput>` is covariant on `TOutput`. The omitted fields
 * (`select`, `placeholderData`, the function form of `enabled`, the
 * function form of `refetchOn{Mount,WindowFocus,Reconnect}`, etc.) all
 * place `TOutput` in a contravariant callback argument position. Including
 * any of them collapses the type to invariant, which breaks the common
 * `ids.map((id) => pillarQueryArg<T>(...))` pattern (the resulting
 * `PillarQueryArg<T>[]` would not satisfy `readonly PillarQueryArg<unknown>[]`).
 *
 * Consumers needing those callbacks should reach for the single-query
 * `usePillarQuery` hook — those features are awkward in a parallel-array
 * context anyway (per-element memoised projection, etc.).
 */
export type PillarParallelQueryOptions<out TOutput> = {
  enabled?: boolean;
  staleTime?: number;
  gcTime?: number;
  refetchInterval?: number | false;
  refetchIntervalInBackground?: boolean;
  retry?: RetryValue;
  retryDelay?: RetryDelayValue;
  networkMode?: NetworkMode;
  initialData?: TOutput | (() => TOutput | undefined);
  initialDataUpdatedAt?: number | (() => number | undefined);
  meta?: QueryMeta;
};

/**
 * A typed descriptor for a single query inside {@link usePillarQueries}.
 *
 * The output type `TOutput` is carried via a phantom field
 * (`[pillarQueryArgOutput]`) — it never exists at runtime, but lets the
 * compiler propagate per-element output types through the `usePillarQueries`
 * tuple result. Build one with {@link pillarQueryArg}.
 *
 * Marked `out TOutput` so the type is covariant — a
 * `PillarQueryArg<Ingredient>` is assignable to `PillarQueryArg<unknown>`,
 * which is the constraint `usePillarQueries` requires. This is why
 * {@link PillarParallelQueryOptions} omits callback fields that take
 * `TOutput` in contravariant position; if any of them were re-introduced
 * the variance modifier would force a type error.
 */
export type PillarQueryArg<out TOutput> = {
  pillarId: string;
  path: ProcedurePath;
  input: unknown;
  options?: PillarParallelQueryOptions<TOutput>;
  readonly [pillarQueryArgOutput]?: TOutput;
};

/**
 * Builder that produces a {@link PillarQueryArg} carrying its output type.
 *
 * Use inside `usePillarQueries` so each element of the input array
 * contributes its own `TOutput` to the result tuple:
 *
 * ```ts
 * const results = usePillarQueries([
 *   pillarQueryArg<Ingredient>({ pillarId: 'food', path: ['ingredients', 'get'], input: { id: 'a' } }),
 *   pillarQueryArg<Unit>({ pillarId: 'food', path: ['units', 'get'], input: { id: 'b' } }),
 * ]);
 * // results[0]: UsePillarQueryResult<Ingredient>
 * // results[1]: UsePillarQueryResult<Unit>
 * ```
 *
 * Because `PillarQueryArg<TOutput>` is covariant on `TOutput`, the
 * `ids.map((id) => pillarQueryArg<T>(...))` pattern also works without
 * a structural cast at the call site.
 */
export function pillarQueryArg<TOutput>(arg: {
  pillarId: string;
  path: ProcedurePath;
  input: unknown;
  options?: PillarParallelQueryOptions<TOutput>;
}): PillarQueryArg<TOutput> {
  return arg as PillarQueryArg<TOutput>;
}

type ResultsFor<T extends readonly PillarQueryArg<unknown>[]> = {
  [K in keyof T]: T[K] extends PillarQueryArg<infer U> ? UsePillarQueryResult<U> : never;
};

/**
 * Parallel-array React Query hook that issues one `pillar(pillarId).path(input)`
 * call per descriptor and returns a tuple of {@link UsePillarQueryResult}s
 * in matching order.
 *
 * Each descriptor is built with {@link pillarQueryArg} so its `TOutput`
 * propagates to the corresponding result element. The number and order
 * of results is stable across renders as long as the `queries` array
 * length is stable — same constraint as React Query's `useQueries`.
 *
 * Each result carries the same `FailureFlags` (`isContractMismatch`,
 * `isUnavailable`, `isDegraded`, `isNotFound`, `isConflict`,
 * `isBadRequest`) as the single-query `usePillarQuery` hook.
 *
 * Cache keys are computed via `pillarQueryKey(pillarId, path, input)`
 * per element, so results de-duplicate against other `usePillarQuery`
 * call sites on the same key.
 */
export function usePillarQueries<T extends readonly PillarQueryArg<unknown>[]>(
  queries: readonly [...T]
): ResultsFor<T> {
  const sdkOptions = usePillarSdkOptions();

  const results = useQueries({
    queries: queries.map((q) => ({
      queryKey: pillarQueryKey(q.pillarId, q.path, q.input),
      queryFn: async () => {
        const result = await callProcedure<unknown>(q.pillarId, q.path, q.input, sdkOptions);
        if (result.kind === 'ok') return result.value;
        throw new PillarCallError(q.pillarId, result);
      },
      ...q.options,
    })),
  });

  return results.map((query) => {
    const flags =
      query.error instanceof PillarCallError ? failureFlagsFrom(query.error.result) : NO_FAILURE;
    return { ...query, ...flags };
  }) as ResultsFor<T>;
}
