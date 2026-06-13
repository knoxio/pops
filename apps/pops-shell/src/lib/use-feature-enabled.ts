import { usePillarQuery } from '@pops/pillar-sdk/react';

type IsEnabledResult = { enabled: boolean };

/**
 * Single read path for runtime feature gating from the frontend.
 *
 * Backed by `core.features.isEnabled` — the same resolver the API uses, so the
 * answer the UI sees is the answer the server enforces. Falls back to the
 * caller-provided default while the query loads, when the core pillar is
 * unavailable, or when the contract has drifted.
 */
export function useFeatureEnabled(key: string, fallback = false): boolean {
  const { data, isUnavailable, isContractMismatch } = usePillarQuery<IsEnabledResult>(
    'core',
    ['features', 'isEnabled'],
    { key }
  );
  if (isUnavailable || isContractMismatch) return fallback;
  return data?.enabled ?? fallback;
}
