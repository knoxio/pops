import { trpc } from '@/lib/trpc';

/**
 * Single read path for runtime feature gating from the frontend.
 *
 * Backed by `core.features.isEnabled` — the same resolver the API uses, so the
 * answer the UI sees is the answer the server enforces. Falls back to the
 * caller-provided default while the query loads.
 */
export function useFeatureEnabled(key: string, fallback = false): boolean {
  const { data } = trpc.core.features.isEnabled.useQuery({ key });
  return data?.enabled ?? fallback;
}
