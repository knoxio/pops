import { trpc } from '@/lib/trpc';
import { useCallback, useMemo } from 'react';

import { Skeleton } from '@pops/ui';

import { GroupRenderer } from './section-renderer/GroupRenderer';
import { useAutoSave } from './section-renderer/useAutoSave';
import { useDynamicOptions } from './section-renderer/useDynamicOptions';
import { useSettingsValues } from './section-renderer/useSettingsValues';

import type { SettingsManifest } from '@pops/types';

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

  const { data, isLoading } = trpc.core.settings.getBulk.useQuery({ keys: allKeys });
  const setBulkMutation = trpc.core.settings.setBulk.useMutation();

  const { values, setValues, loadedKeys } = useSettingsValues({ data, manifest });
  const { dynamicOptions, loadingOptionKeys } = useDynamicOptions(optionsLoaders);
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
