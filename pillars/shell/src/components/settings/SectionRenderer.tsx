import { useCallback } from 'react';

import { Skeleton } from '@pops/ui';

import { GroupRenderer } from './section-renderer/GroupRenderer';
import { useSectionState } from './section-renderer/useSectionState';

import type { SettingsManifest } from '@pops/types';

interface SectionRendererProps {
  manifest: SettingsManifest;
  /** The pillar that owns this section's settings; resolves the transport. */
  ownerPillar?: string;
  /** Live `capabilities.settings` flag — routes to the owning pillar when true, else `registry`. */
  hasFederatedSettings?: boolean;
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

/**
 * Renders one settings section and routes its read/write to the OWNING pillar
 * (capability-gated) via `useSectionState`. When the owning pillar has not
 * advertised the `settings` capability the transport falls back to the
 * `registry` pillar, so an un-upgraded pillar keeps working.
 */
export function SectionRenderer({
  manifest,
  ownerPillar = 'registry',
  hasFederatedSettings = false,
  optionsLoaders,
  onTestAction,
}: SectionRendererProps) {
  const {
    isLoading,
    values,
    loadedKeys,
    dynamicOptions,
    loadingOptionKeys,
    saveStates,
    handleChange,
  } = useSectionState(manifest, ownerPillar, hasFederatedSettings, optionsLoaders);

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
  // unavailable / drifted contract) falls through to render the groups with
  // their static defaults rather than hang on a skeleton.
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
