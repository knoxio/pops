import { featuresIsEnabled } from '@/registry-api';
import { unwrap } from '@/registry-api-helpers';
import { useQuery } from '@tanstack/react-query';

/**
 * Single read path for runtime feature gating from the frontend.
 *
 * Backed by `core.features.isEnabled` — the same resolver the API uses, so the
 * answer the UI sees is the answer the server enforces. Falls back to the
 * caller-provided default while the query loads or on any failure: a pillar
 * that is unavailable (network/5xx), a drifted contract, or an unknown key
 * (404) all resolve to the fallback — a feature that cannot be confirmed on
 * is gated off, never silently on.
 */
export function useFeatureEnabled(key: string, fallback = false): boolean {
  const { data, isError } = useQuery({
    queryKey: ['registry', 'features', 'isEnabled', key],
    queryFn: async () => unwrap(await featuresIsEnabled({ path: { key } })),
  });
  if (isError) return fallback;
  return data?.enabled ?? fallback;
}
