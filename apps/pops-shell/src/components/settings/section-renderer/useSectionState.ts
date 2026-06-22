import { settingsClientFor } from '@/lib/settings-client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';

import { useAutoSave } from './useAutoSave';
import { useDynamicOptions } from './useDynamicOptions';
import { useDynamicOptionsLoaders } from './useDynamicOptionsLoaders';
import { useSettingsValues } from './useSettingsValues';

import type { SettingsManifest } from '@pops/types';

type OptionsLoaders = Record<string, () => Promise<{ value: string; label: string }[]>>;

/**
 * Reads and writes the section's settings against the OWNING pillar's
 * federated `/settings` surface (settings-federation S3), capability-gated:
 * when the pillar advertises the live `settings` capability the transport
 * targets `/<ownerPillar>-api/settings`, otherwise it falls back to
 * `/core-api/settings` (where the value still lives during the rollout).
 *
 * Both `get-many` / `set-many` round-trip the `{ settings: Record<key,value> }`
 * shape `useSettingsValues` and `useAutoSave` expect. The setter invalidates
 * the matching `getMany` query so the loaded baseline reflects the saved value.
 */
function useBulkSettings(allKeys: string[], ownerPillar: string, hasFederatedSettings: boolean) {
  const queryClient = useQueryClient();
  const transportKey = hasFederatedSettings ? ownerPillar : 'core';
  const queryKey = ['settings', transportKey, 'getMany', allKeys] as const;
  const client = useMemo(
    () => settingsClientFor(ownerPillar, hasFederatedSettings),
    [ownerPillar, hasFederatedSettings]
  );

  const query = useQuery({
    queryKey,
    queryFn: async () => client.getMany(allKeys),
  });

  const mutation = useMutation({
    mutationFn: async (input: { entries: { key: string; value: string }[] }) =>
      client.setMany(input.entries),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['settings', transportKey, 'getMany'] });
    },
  });

  return { query, mutation };
}

/**
 * Wires the per-section settings state (capability-gated bulk read/write,
 * effective values, dynamic select-option loaders, debounced auto-save) into a
 * single object the renderer consumes. Keeps `SectionRenderer` a thin
 * presentational shell.
 */
export function useSectionState(
  manifest: SettingsManifest,
  ownerPillar: string,
  hasFederatedSettings: boolean,
  optionsLoaders?: OptionsLoaders
) {
  const allKeys = useMemo(
    () => manifest.groups.flatMap((g) => g.fields.map((f) => f.key)),
    [manifest.groups]
  );
  const fieldsByKey = useMemo(
    () => Object.fromEntries(manifest.groups.flatMap((g) => g.fields.map((f) => [f.key, f]))),
    [manifest.groups]
  );

  const { query: bulkQuery, mutation: setBulkMutation } = useBulkSettings(
    allKeys,
    ownerPillar,
    hasFederatedSettings
  );

  const { values, setValues, loadedKeys } = useSettingsValues({ data: bulkQuery.data, manifest });
  const dynamicLoaders = useDynamicOptionsLoaders(manifest);
  const mergedLoaders = useMemo(
    () => (optionsLoaders ? { ...dynamicLoaders, ...optionsLoaders } : dynamicLoaders),
    [dynamicLoaders, optionsLoaders]
  );
  const { dynamicOptions, loadingOptionKeys } = useDynamicOptions(
    Object.keys(mergedLoaders).length > 0 ? mergedLoaders : undefined
  );
  const { saveStates, handleChange } = useAutoSave({ setBulkMutation, fieldsByKey, setValues });

  return {
    isLoading: bulkQuery.isLoading,
    values,
    loadedKeys,
    dynamicOptions,
    loadingOptionKeys,
    saveStates,
    handleChange,
  };
}
