import {
  featuresClearUserPreference,
  featuresSetEnabled,
  featuresSetUserPreference,
} from '@/core-api';
import { unwrap } from '@/core-api-helpers';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import type { FeatureStatus } from '@pops/types';

interface FeatureToggleHandlers {
  toggle: (checked: boolean) => void;
  resetUserOverride: () => void;
  errorMessage: string | undefined;
  pending: boolean;
}

/**
 * Bundles the core mutations a feature card needs (system enable, per-user
 * override, user override clear) so the card stays small.
 *
 * Each mutation invalidates the `['core', 'features']` query prefix on success
 * — that covers `features.list`, `features.getManifests`, and the per-key
 * `features.isEnabled` gates, mirroring the router-prefix invalidation the
 * legacy `usePillarMutation` did automatically.
 */
export function useFeatureMutations(feature: FeatureStatus): FeatureToggleHandlers {
  const queryClient = useQueryClient();
  const invalidateFeatures = () => {
    void queryClient.invalidateQueries({ queryKey: ['core', 'features'] });
  };

  const setEnabled = useMutation({
    mutationFn: async (input: { key: string; enabled: boolean }) =>
      unwrap(
        await featuresSetEnabled({ path: { key: input.key }, body: { enabled: input.enabled } })
      ),
    onSuccess: invalidateFeatures,
  });
  const setUserPreference = useMutation({
    mutationFn: async (input: { key: string; enabled: boolean }) =>
      unwrap(
        await featuresSetUserPreference({
          path: { key: input.key },
          body: { enabled: input.enabled },
        })
      ),
    onSuccess: invalidateFeatures,
  });
  const clearUserPreference = useMutation({
    mutationFn: async (input: { key: string }) =>
      unwrap(await featuresClearUserPreference({ path: { key: input.key }, body: {} })),
    onSuccess: invalidateFeatures,
  });

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
