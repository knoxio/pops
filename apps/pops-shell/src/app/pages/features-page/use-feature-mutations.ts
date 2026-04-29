import { trpc } from '@/lib/trpc';

import type { FeatureStatus } from '@pops/types';

interface FeatureToggleHandlers {
  toggle: (checked: boolean) => void;
  resetUserOverride: () => void;
  errorMessage: string | undefined;
  pending: boolean;
}

/**
 * Bundles the trpc mutations a feature card needs (system enable, per-user
 * override, user override clear) so the card stays small.
 */
export function useFeatureMutations(feature: FeatureStatus): FeatureToggleHandlers {
  const utils = trpc.useUtils();
  const onSuccess = () => utils.core.features.list.invalidate();

  const setEnabled = trpc.core.features.setEnabled.useMutation({ onSuccess });
  const setUserPreference = trpc.core.features.setUserPreference.useMutation({ onSuccess });
  const clearUserPreference = trpc.core.features.clearUserPreference.useMutation({ onSuccess });

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
