import { usePillarMutation } from '@pops/pillar-sdk/react';

import type { FeatureStatus } from '@pops/types';

interface FeatureToggleHandlers {
  toggle: (checked: boolean) => void;
  resetUserOverride: () => void;
  errorMessage: string | undefined;
  pending: boolean;
}

type SetEnabledInput = { key: string; enabled: boolean };
type SetEnabledResult = { enabled: boolean };
type ClearPreferenceInput = { key: string };
type ClearPreferenceResult = { cleared: boolean };

/**
 * Bundles the SDK mutations a feature card needs (system enable, per-user
 * override, user override clear) so the card stays small.
 *
 * `usePillarMutation` auto-invalidates the `[core, features]` router prefix
 * on success — that covers `features.list`, `features.getManifests`, and
 * `features.isEnabled`, so no manual `utils.*.invalidate()` is required.
 */
export function useFeatureMutations(feature: FeatureStatus): FeatureToggleHandlers {
  const setEnabled = usePillarMutation<SetEnabledInput, SetEnabledResult>('core', [
    'features',
    'setEnabled',
  ]);
  const setUserPreference = usePillarMutation<SetEnabledInput, SetEnabledResult>('core', [
    'features',
    'setUserPreference',
  ]);
  const clearUserPreference = usePillarMutation<ClearPreferenceInput, ClearPreferenceResult>(
    'core',
    ['features', 'clearUserPreference']
  );

  const toggle = (checked: boolean) => {
    if (feature.scope === 'user') {
      setUserPreference.mutate({ key: feature.key, enabled: checked });
    } else {
      setEnabled.mutate({ key: feature.key, enabled: checked });
    }
  };

  const resetUserOverride = () => {
    clearUserPreference.mutate({ key: feature.key });
  };

  return {
    toggle,
    resetUserOverride,
    errorMessage: setEnabled.error?.message ?? setUserPreference.error?.message,
    pending: setEnabled.isPending || setUserPreference.isPending || clearUserPreference.isPending,
  };
}
