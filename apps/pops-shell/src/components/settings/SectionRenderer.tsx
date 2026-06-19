import { settingsGetMany, settingsSetMany } from '@/core-api';
import { unwrap } from '@/core-api-helpers';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';

import { Skeleton } from '@pops/ui';

import { GroupRenderer } from './section-renderer/GroupRenderer';
import { useAutoSave } from './section-renderer/useAutoSave';
import { useDynamicOptions } from './section-renderer/useDynamicOptions';
import { useDynamicOptionsLoaders } from './section-renderer/useDynamicOptionsLoaders';
import { useSettingsValues } from './section-renderer/useSettingsValues';

import type { SettingsManifest } from '@pops/types';

/**
 * Reads and writes the section's settings over core's REST surface
 * (`settings.getMany` / `settings.setMany`). Both round-trip the
 * `{ settings: Record<string, string> }` shape `useSettingsValues` and
 * `useAutoSave` expect. The setter invalidates the matching `getMany` query
 * so the loaded baseline reflects the saved value.
 */
function useBulkSettings(allKeys: string[]) {
  const queryClient = useQueryClient();
  const queryKey = ['core', 'settings', 'getMany', allKeys] as const;

  const query = useQuery({
    queryKey,
    queryFn: async () => unwrap(await settingsGetMany({ body: { keys: allKeys } })),
  });

  const mutation = useMutation({
    mutationFn: async (input: { entries: { key: string; value: string }[] }) =>
      unwrap(await settingsSetMany({ body: { entries: input.entries } })),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['core', 'settings', 'getMany'] });
    },
  });

  return { query, mutation };
}

interface SectionRendererProps {
  manifest: SettingsManifest;
  optionsLoaders?: Record<string, () => Promise<{ value: string; label: string }[]>>;
  onTestAction?: (procedure: string) => Promise<void>;
}

function applyDynamicOptions(
  manifest: SettingsManifest,
  dynamicOptions: Record<string, { value: string; label: string }[]>
): SettingsManifest {
  return {
    ...manifest,
    groups: manifest.groups.map((group) => ({
      ...group,
      fields: group.fields.map((field) => ({
        ...field,
        options: dynamicOptions[field.key] ?? field.options,
      })),
    })),
  };
}

export function SectionRenderer({ manifest, optionsLoaders, onTestAction }: SectionRendererProps) {
  const allKeys = useMemo(
    () => manifest.groups.flatMap((g) => g.fields.map((f) => f.key)),
    [manifest.groups]
  );
  const fieldsByKey = useMemo(
    () => Object.fromEntries(manifest.groups.flatMap((g) => g.fields.map((f) => [f.key, f]))),
    [manifest.groups]
  );

  const { query: bulkQuery, mutation: setBulkMutation } = useBulkSettings(allKeys);
  const { data, isLoading } = bulkQuery;

  const { values, setValues, loadedKeys } = useSettingsValues({ data, manifest });
  const dynamicLoaders = useDynamicOptionsLoaders(manifest);
  const mergedLoaders = useMemo(
    () => (optionsLoaders ? { ...dynamicLoaders, ...optionsLoaders } : dynamicLoaders),
    [dynamicLoaders, optionsLoaders]
  );
  const { dynamicOptions, loadingOptionKeys } = useDynamicOptions(
    Object.keys(mergedLoaders).length > 0 ? mergedLoaders : undefined
  );
  const { saveStates, handleChange } = useAutoSave({ setBulkMutation, fieldsByKey, setValues });

  const handleTestAction = useCallback(
    async (procedure: string) => {
      if (onTestAction) {
        await onTestAction(procedure);
        return;
      }
      throw new Error(`No handler for procedure: ${procedure}`);
    },
    [onTestAction]
  );

  // `isLoading` is true only on the genuine first fetch; a failed load (pillar
  // unavailable / drifted contract) reports `isError` instead, so we fall
  // through and render the groups with their static defaults rather than hang
  // on a skeleton.
  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  const manifestWithDynamicOptions = applyDynamicOptions(manifest, dynamicOptions);

  return (
    <div className="space-y-4">
      {manifestWithDynamicOptions.groups.map((group) => (
        <GroupRenderer
          key={group.id}
          group={group}
          values={values}
          onChange={handleChange}
          onTestAction={handleTestAction}
          dbValues={loadedKeys}
          saveStates={saveStates}
          loadingOptionKeys={loadingOptionKeys}
        />
      ))}
    </div>
  );
}
