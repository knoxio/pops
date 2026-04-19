import { Database, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { trpc } from '@pops/api-client';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
  Button,
  Card,
  formatBytes,
  Input,
  Label,
  Skeleton,
} from '@pops/ui';

export function CacheManagementCard() {
  const utils = trpc.useUtils();
  const [staleDays, setStaleDays] = useState(30);

  const { data: cacheStats, isLoading: cacheLoading } = trpc.core.aiUsage.cacheStats.useQuery();

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

  if (cacheLoading) {
    return <Skeleton className="h-24" />;
  }

  const totalEntries = cacheStats?.totalEntries ?? 0;
  const hasEntries = totalEntries > 0;

  return (
    <Card className="p-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Database className="h-5 w-5 text-muted-foreground" />
          <div>
            <h3 className="font-semibold">AI Cache</h3>
            <p className="text-sm text-muted-foreground">
              {totalEntries.toLocaleString()} entries
              {cacheStats ? ` (${formatBytes(cacheStats.diskSizeBytes)})` : ''}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5">
            <Label
              htmlFor="stale-days"
              className="text-muted-foreground whitespace-nowrap font-normal"
            >
              Older than
            </Label>
            <Input
              id="stale-days"
              type="number"
              min={1}
              max={365}
              value={staleDays}
              onChange={(e) => setStaleDays(Number(e.target.value) || 30)}
              className="w-16 h-8 px-2 py-1 text-sm text-center"
            />
            <span className="text-sm text-muted-foreground">days</span>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => clearStaleMutation.mutate({ maxAgeDays: staleDays })}
            disabled={clearStaleMutation.isPending || !hasEntries}
          >
            Clear Stale
          </Button>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive"
                disabled={clearAllMutation.isPending || !hasEntries}
              >
                <Trash2 className="mr-1 h-3.5 w-3.5" />
                Clear All
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Clear entire AI cache?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will remove all {totalEntries.toLocaleString()} cached categorization
                  results. Future transactions will require new API calls.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  variant="ghost"
                  className="text-destructive hover:text-destructive"
                  onClick={() => clearAllMutation.mutate()}
                >
                  Clear All
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
    </Card>
  );
}
