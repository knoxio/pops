import { useCallback } from 'react';

import { pillar, type CallResult } from '@pops/pillar-sdk/client';
import { usePillarSdkOptions } from '@pops/pillar-sdk/react';

type ProcedurePath = readonly [string, ...string[]];

/**
 * Imperative one-shot call against a pillar procedure. Mirrors the discontinued
 * `trpc.useUtils().<pillar>.<path>.fetch(input)` pattern (no caching, no
 * suspense) so existing call sites that need an ad-hoc lookup — e.g. asset-id
 * uniqueness checks fired from a form blur — can continue to work without
 * pulling React Query state into the flow.
 *
 * Returns the raw `CallResult` so callers can branch on `kind === 'ok'`
 * versus the `unavailable` / `contract-mismatch` / `degraded` discriminants.
 */
export function usePillarCall(): <TOutput>(
  pillarId: string,
  path: ProcedurePath,
  input: unknown
) => Promise<CallResult<TOutput>> {
  const sdkOptions = usePillarSdkOptions();
  return useCallback(
    async <TOutput>(
      pillarId: string,
      path: ProcedurePath,
      input: unknown
    ): Promise<CallResult<TOutput>> => {
      const handle = pillar<unknown>(pillarId, sdkOptions);
      let node: unknown = handle;
      for (let i = 0; i < path.length - 1; i += 1) {
        const segment = path[i] as string;
        node = (node as Record<string, unknown>)[segment];
      }
      const leafName = path[path.length - 1] as string;
      const leaf = (node as Record<string, unknown>)[leafName];
      if (typeof leaf !== 'function') {
        return {
          kind: 'contract-mismatch',
          pillar: pillarId,
          actual: path.join('.'),
        };
      }
      return (leaf as (i: unknown) => Promise<CallResult<TOutput>>)(input);
    },
    [sdkOptions]
  );
}
