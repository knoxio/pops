import { useMemo, useRef } from 'react';

import { pillar } from '@pops/pillar-sdk/client';
import { usePillarSdkOptions } from '@pops/pillar-sdk/react';

import type { SettingsManifest } from '@pops/types';

type Options = { value: string; label: string }[];
type Loaders = Record<string, () => Promise<Options>>;

/**
 * Builds per-field option loaders for `select` settings whose options come
 * from a runtime procedure. The procedure string is supplied by manifest data
 * at runtime in the shape `pillarId.routerName.procName`, so a generated
 * per-pillar client can't express the call — the path isn't known at build
 * time. This stays on the generic REST SDK escape hatch
 * `pillar(id).callDynamic(router, proc, input)` (see
 * docs/themes/federation/prds/client-surface).
 *
 * The procedure is expected to return `{ data: Record<string, unknown>[] }`.
 */
export function useDynamicOptionsLoaders(manifest: SettingsManifest): Loaders {
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
          if (
            result.kind === 'not-found' ||
            result.kind === 'conflict' ||
            result.kind === 'bad-request' ||
            result.kind === 'unauthorized'
          ) {
            throw new Error(result.message ?? `Pillar '${pillarId}' call failed: ${result.kind}`);
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
