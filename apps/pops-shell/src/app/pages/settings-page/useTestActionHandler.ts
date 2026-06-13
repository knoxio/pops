import { useCallback } from 'react';

import { pillar } from '@pops/pillar-sdk/client';
import { usePillarSdkOptions } from '@pops/pillar-sdk/react';

/**
 * Drives the per-section "Test" button. The button's `procedure` string is
 * supplied by a settings manifest at runtime in the shape
 * `pillarId.routerName.procName`, so the SDK's typed proxy can't be used
 * directly — `pillar(id).callDynamic(router, proc, input, kind)` (PRD-204
 * + PR #3131) is the supported escape hatch.
 *
 * The pillar's tRPC HTTP transport doesn't differentiate query vs mutation
 * on the wire, so a `query` call always succeeds against either kind; the
 * `'query'` kind is the safe default and is reserved for future routing
 * instrumentation.
 */
export function useTestActionHandler() {
  const sdkOptions = usePillarSdkOptions();

  return useCallback(
    async (procedure: string) => {
      const parts = procedure.split('.');
      if (parts.length !== 3) {
        throw new Error(`Cannot call procedure: ${procedure}`);
      }
      const [pillarId, routerName, procName] = parts as [string, string, string];

      const handle = pillar(pillarId, sdkOptions);
      const result = await handle.callDynamic(routerName, procName, {}, 'query');

      if (result.kind === 'unavailable') {
        throw new Error(`Pillar '${pillarId}' is unavailable`);
      }
      if (result.kind === 'degraded') {
        throw new Error(`Pillar '${pillarId}' is degraded (${result.reason})`);
      }
      if (result.kind === 'contract-mismatch') {
        throw new Error(`Cannot call procedure: ${procedure}`);
      }
      if (
        result.kind === 'not-found' ||
        result.kind === 'conflict' ||
        result.kind === 'bad-request'
      ) {
        throw new Error(result.message ?? `Pillar '${pillarId}' call failed: ${result.kind}`);
      }

      assertConnected(result.value);
    },
    [sdkOptions]
  );
}

/** Throws if the procedure response signals a failed connection without throwing. */
function assertConnected(value: unknown): void {
  if (!value || typeof value !== 'object') return;
  const data = (value as Record<string, unknown>).data;
  if (!data || typeof data !== 'object') return;
  const typed = data as { connected?: boolean; error?: string };
  if (typed.connected === false) {
    throw new Error(typed.error ?? 'Connection failed');
  }
}
