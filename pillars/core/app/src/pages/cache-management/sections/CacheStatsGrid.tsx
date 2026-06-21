import { formatBytes, Skeleton, StatCard } from '@pops/ui';

type CacheStatsGridProps = {
  isLoading: boolean;
  totalEntries: number;
  diskSizeBytes: number;
  totalCacheHits: number;
  hitRateDisplay: string;
};

export function CacheStatsGrid({
  isLoading,
  totalEntries,
  diskSizeBytes,
  totalCacheHits,
  hitRateDisplay,
}: CacheStatsGridProps) {
  if (isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-32" />
        ))}
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-3">
      <StatCard
        title="Total Entries"
        value={totalEntries.toLocaleString()}
        description="Cached entity categorisations"
        color="indigo"
      />
      <StatCard
        title="Disk Size"
        value={formatBytes(diskSizeBytes)}
        description="Approximate cache file size"
        color="sky"
      />
      <StatCard
        title="Hit Rate"
        value={hitRateDisplay}
        description={`${totalCacheHits.toLocaleString()} cached results`}
        color="emerald"
      />
    </div>
  );
}
