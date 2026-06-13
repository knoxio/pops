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

import type { UsePillarQueryOptions, UsePillarQueryResult } from './hooks.js';

declare const pillarQueryArgOutput: unique symbol;

/**
 * A typed descriptor for a single query inside {@link usePillarQueries}.
 *
 * The output type `TOutput` is carried via a phantom field
 * (`[pillarQueryArgOutput]`) — it never exists at runtime, but lets the
 * compiler propagate per-element output types through the `usePillarQueries`
 * tuple result. Build one with {@link pillarQueryArg}.
 */
export type PillarQueryArg<TOutput> = {
  pillarId: string;
  path: ProcedurePath;
  input: unknown;
  options?: UsePillarQueryOptions<TOutput>;
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
 */
export function pillarQueryArg<TOutput>(arg: {
  pillarId: string;
  path: ProcedurePath;
  input: unknown;
  options?: UsePillarQueryOptions<TOutput>;
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
