import { Database, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';

/**
 * CacheManagementPage — View and manage the AI entity cache.
 *
 * Shows cache stats (total entries, disk size, hit rate) and provides
 * controls to clear stale or all cache entries. PRD-053/US-03.
 */
import {
  Alert,
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
  Button,
  Card,
  Input,
  Label,
  PageHeader,
  Skeleton,
  StatCard,
} from '@pops/ui';

import { trpc } from '../lib/trpc';

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function CacheManagementPage() {
  const utils = trpc.useUtils();
  const [staleDays, setStaleDays] = useState(30);

  const {
    data: cacheStats,
    isLoading: cacheLoading,
    error: cacheError,
  } = trpc.core.aiUsage.cacheStats.useQuery();

  const { data: usageStats, isLoading: usageLoading } = trpc.core.aiUsage.getStats.useQuery();

  const clearStaleMutation = trpc.core.aiUsage.clearStaleCache.useMutation({
    onSuccess: (data) => {
      toast.success(`Removed ${data.removed} stale cache entries`);
      void utils.core.aiUsage.cacheStats.invalidate();
    },
    onError: () => {
      toast.error('Failed to clear stale cache');
    },
  });

  const clearAllMutation = trpc.core.aiUsage.clearAllCache.useMutation({
    onSuccess: (data) => {
      toast.success(`Cleared ${data.removed} cache entries`);
      void utils.core.aiUsage.cacheStats.invalidate();
    },
    onError: () => {
      toast.error('Failed to clear cache');
    },
  });

  const totalRequests = (usageStats?.totalApiCalls ?? 0) + (usageStats?.totalCacheHits ?? 0);
  const hitRatePct = totalRequests > 0 ? ((usageStats?.cacheHitRate ?? 0) * 100).toFixed(1) : '0.0';

  const isEmpty = (cacheStats?.totalEntries ?? 0) === 0;

  return (
    <div className="space-y-6">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link to="/ai">AI Usage</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Cache Management</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <PageHeader
        title="Cache Management"
        description="View and manage the AI entity categorisation cache"
      />

      {cacheError && (
        <Alert variant="destructive">
          <h3 className="font-semibold">Failed to load cache stats</h3>
          <p className="text-sm mt-1">{cacheError.message}</p>
        </Alert>
      )}

      {/* Stats Cards */}
      {cacheLoading || usageLoading ? (
        <div className="grid gap-4 md:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-3">
          <StatCard
            title="Total Entries"
            value={(cacheStats?.totalEntries ?? 0).toLocaleString()}
            description="Cached entity categorisations"
            color="indigo"
          />
          <StatCard
            title="Disk Size"
            value={formatBytes(cacheStats?.diskSizeBytes ?? 0)}
            description="Approximate cache file size"
            color="sky"
          />
          <StatCard
            title="Hit Rate"
            value={`${hitRatePct}%`}
            description={`${(usageStats?.totalCacheHits ?? 0).toLocaleString()} cached results`}
            color="emerald"
          />
        </div>
      )}

      {/* Cache Actions */}
      <Card className="p-6">
        <div className="flex items-center gap-3 mb-6">
          <Database className="h-5 w-5 text-muted-foreground" />
          <h2 className="text-lg font-semibold">Clear Cache</h2>
        </div>

        <div className="space-y-4">
          {/* Clear Stale */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between rounded-lg border p-4">
            <div>
              <h3 className="font-medium">Clear Stale Entries</h3>
              <p className="text-sm text-muted-foreground mt-0.5">
                Remove entries that have not been accessed for a given number of days.
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Label
                htmlFor="stale-days"
                className="text-muted-foreground whitespace-nowrap font-normal text-sm"
              >
                Older than
              </Label>
              <Input
                id="stale-days"
                type="number"
                min={1}
                max={365}
                value={staleDays}
                onChange={(e) => {
                  setStaleDays(Number(e.target.value) || 30);
                }}
                className="w-16 h-8 px-2 py-1 text-sm text-center"
                aria-label="Days threshold for stale entries"
              />
              <span className="text-sm text-muted-foreground">days</span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  clearStaleMutation.mutate({ maxAgeDays: staleDays });
                }}
                disabled={clearStaleMutation.isPending || isEmpty}
              >
                Clear Stale
              </Button>
            </div>
          </div>

          {/* Clear All */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between rounded-lg border border-destructive/30 p-4">
            <div>
              <h3 className="font-medium">Clear Entire Cache</h3>
              <p className="text-sm text-muted-foreground mt-0.5">
                Remove all cached entries. Future imports will make new API calls to rebuild the
                cache.
              </p>
            </div>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="destructive"
                  size="sm"
                  disabled={clearAllMutation.isPending || isEmpty}
                  className="shrink-0"
                >
                  <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                  Clear All
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Clear entire AI cache?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will remove all {(cacheStats?.totalEntries ?? 0).toLocaleString()} cached
                    categorisation results. Future imports will require new API calls, incurring
                    additional costs.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => {
                      clearAllMutation.mutate();
                    }}
                  >
                    Clear All
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      </Card>
    </div>
  );
}
