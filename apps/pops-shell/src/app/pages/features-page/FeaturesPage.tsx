import { trpc } from '@/lib/trpc';
import { useMemo } from 'react';

import { Skeleton } from '@pops/ui';

import { FeatureCard } from './FeatureCard';

import type { FeatureManifest, FeatureStatus } from '@pops/types';

import type { FeaturesByManifest } from './types';

function groupByManifest(
  manifests: FeatureManifest[],
  statuses: FeatureStatus[]
): FeaturesByManifest[] {
  const byId = new Map<string, FeatureStatus[]>();
  for (const status of statuses) {
    const list = byId.get(status.manifestId) ?? [];
    list.push(status);
    byId.set(status.manifestId, list);
  }
  return manifests
    .map((manifest) => ({ manifest, statuses: byId.get(manifest.id) ?? [] }))
    .filter((entry) => entry.statuses.length > 0);
}

export function FeaturesPage() {
  const manifestsQuery = trpc.core.features.getManifests.useQuery();
  const listQuery = trpc.core.features.list.useQuery();

  const grouped = useMemo<FeaturesByManifest[]>(
    () => groupByManifest(manifestsQuery.data?.manifests ?? [], listQuery.data?.features ?? []),
    [manifestsQuery.data?.manifests, listQuery.data?.features]
  );

  if (manifestsQuery.isLoading || listQuery.isLoading) {
    return (
      <div className="p-6 max-w-3xl mx-auto space-y-3">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (grouped.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">
        No features registered.
      </div>
    );
  }

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-10">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold">Features</h1>
        <p className="text-sm text-muted-foreground">
          Toggle integrations and runtime capabilities. Credentials are configured separately on the
          Settings page.
        </p>
      </header>

      {grouped.map(({ manifest, statuses }) => (
        <section key={manifest.id} id={manifest.id} className="space-y-3 scroll-mt-20">
          <h2 className="text-base font-semibold">{manifest.title}</h2>
          <div className="space-y-3">
            {statuses.map((feature) => (
              <FeatureCard key={feature.key} feature={feature} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
