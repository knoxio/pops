import { trpc } from '@/lib/trpc';
import { traverseTrpcPath } from '@/lib/trpc-traverse';
import { useMemo, useRef } from 'react';

import type { SettingsManifest } from '@pops/types';

type Options = { value: string; label: string }[];
type Loaders = Record<string, () => Promise<Options>>;

export function useTrpcOptionsLoaders(manifest: SettingsManifest): Loaders {
  const utils = trpc.useUtils();
  // Keep a ref so loader closures always see the latest utils without causing
  // the memo to invalidate on every render (utils identity is not stable in tests
  // and can vary across render cycles in production too).
  const utilsRef = useRef(utils);
  utilsRef.current = utils;

  return useMemo(() => {
    const loaders: Loaders = {};
    for (const group of manifest.groups) {
      for (const field of group.fields) {
        if (!field.optionsLoader) continue;
        const { procedure, valueKey, labelKey } = field.optionsLoader;
        const key = field.key;
        loaders[key] = async () => {
          const node = traverseTrpcPath(utilsRef.current.client, procedure);
          let raw: unknown;
          if (typeof node.query === 'function') {
            raw = await (node.query as () => Promise<unknown>)();
          } else {
            throw new Error(`Procedure is not a query: ${procedure}`);
          }
          const result = raw as { data?: Record<string, unknown>[] };
          const items = result?.data ?? [];
          return items.map((item) => ({
            value: String(item[valueKey]),
            label: String(item[labelKey]),
          }));
        };
      }
    }
    return loaders;
  }, [manifest]); // manifest only — utils accessed via ref to avoid reference churn
}
