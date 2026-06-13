import { useMemo, useRef } from 'react';

import { pillar } from '@pops/pillar-sdk/client';
import { usePillarSdkOptions } from '@pops/pillar-sdk/react';

import type { SettingsManifest } from '@pops/types';

type Options = { value: string; label: string }[];
type Loaders = Record<string, () => Promise<Options>>;

/**
 * Builds per-field option loaders for `select` settings whose options come
 * from a runtime procedure. The procedure string is supplied by manifest
 * data in the shape `pillarId.routerName.procName`, which is why the SDK's
 * typed proxy can't be used directly here — `pillar(id).callDynamic(router,
 * proc, input)` (PRD-204 + PR #3131) is the supported escape hatch.
 *
 * The procedure is expected to return `{ data: Record<string, unknown>[] }`
 * (the same envelope the legacy tRPC traversal expected).
 */
export function useTrpcOptionsLoaders(manifest: SettingsManifest): Loaders {
  const sdkOptions = usePillarSdkOptions();
  const sdkOptionsRef = useRef(sdkOptions);
  sdkOptionsRef.current = sdkOptions;

  return useMemo(() => {
    const loaders: Loaders = {};
    for (const group of manifest.groups) {
      for (const field of group.fields) {
        if (!field.optionsLoader) continue;
        const { procedure, valueKey, labelKey } = field.optionsLoader;
        const key = field.key;
        loaders[key] = async () => {
          const parts = procedure.split('.');
          if (parts.length !== 3) {
            throw new Error(`Cannot call procedure: ${procedure}`);
          }
          const [pillarId, routerName, procName] = parts as [string, string, string];

          const handle = pillar(pillarId, sdkOptionsRef.current);
          const result = await handle.callDynamic(routerName, procName, undefined, 'query');

          if (result.kind === 'unavailable') {
            throw new Error(`Pillar '${pillarId}' is unavailable`);
          }
          if (result.kind === 'degraded') {
            throw new Error(`Pillar '${pillarId}' is degraded (${result.reason})`);
          }
          if (result.kind === 'contract-mismatch') {
            throw new Error(`Cannot call procedure: ${procedure}`);
          }

          const envelope = result.value as { data?: Record<string, unknown>[] } | null;
          const items = envelope?.data ?? [];
          return items.map((item) => ({
            value: String(item[valueKey]),
            label: String(item[labelKey]),
          }));
        };
      }
    }
    return loaders;
  }, [manifest]);
}
