/**
 * AI Usage page - view AI categorization costs and usage
 */
import { useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { toast } from "sonner";
import { trpc } from "../lib/trpc";
import { DataTable, SortableHeader, StatCard } from "@pops/ui";
import { Badge, Button } from "@pops/ui";
import { Alert } from "@pops/ui";
import { Skeleton } from "@pops/ui";
import { Card } from "@pops/ui";
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
} from "@pops/ui";
import { Database, Trash2 } from "lucide-react";

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function CacheManagement() {
  const utils = trpc.useUtils();
  const [staleDays, setStaleDays] = useState(30);

  const { data: cacheStats, isLoading: cacheLoading } =
    trpc.core.aiUsage.cacheStats.useQuery();

  const clearStaleMutation = trpc.core.aiUsage.clearStaleCache.useMutation({
    onSuccess: (data) => {
      toast.success(`Removed ${data.removed} stale cache entries`);
      void utils.core.aiUsage.cacheStats.invalidate();
    },
    onError: () => {
      toast.error("Failed to clear stale cache");
    },
  });

  const clearAllMutation = trpc.core.aiUsage.clearAllCache.useMutation({
    onSuccess: (data) => {
      toast.success(`Cleared ${data.removed} cache entries`);
      void utils.core.aiUsage.cacheStats.invalidate();
    },
    onError: () => {
      toast.error("Failed to clear cache");
    },
  });

  if (cacheLoading) {
    return <Skeleton className="h-24" />;
  }

  return (
    <Card className="p-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Database className="h-5 w-5 text-muted-foreground" />
          <div>
            <h3 className="font-semibold">AI Cache</h3>
            <p className="text-sm text-muted-foreground">
              {cacheStats?.totalEntries.toLocaleString() ?? 0} entries
              {cacheStats ? ` (${formatBytes(cacheStats.diskSizeBytes)})` : ""}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5">
            <label htmlFor="stale-days" className="text-sm text-muted-foreground whitespace-nowrap">
              Older than
            </label>
            <input
              id="stale-days"
              type="number"
              min={1}
              max={365}
              value={staleDays}
              onChange={(e) => setStaleDays(Number(e.target.value) || 30)}
              className="w-16 rounded-md border border-input bg-background px-2 py-1 text-sm text-center"
            />
            <span className="text-sm text-muted-foreground">days</span>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => clearStaleMutation.mutate({ maxAgeDays: staleDays })}
            disabled={clearStaleMutation.isPending || (cacheStats?.totalEntries ?? 0) === 0}
          >
            Clear Stale
          </Button>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="destructive"
                size="sm"
                disabled={clearAllMutation.isPending || (cacheStats?.totalEntries ?? 0) === 0}
              >
                <Trash2 className="mr-1 h-3.5 w-3.5" />
                Clear All
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Clear entire AI cache?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will remove all {cacheStats?.totalEntries.toLocaleString() ?? 0} cached
                  categorization results. Future transactions will require new API calls,
                  which will incur additional costs.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={() => clearAllMutation.mutate()}>
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

interface AiUsageRecord {
  date: string;
  apiCalls: number;
  cacheHits: number;
  inputTokens: number;
  outputTokens: number;
  cost: number;
}

export function AiUsagePage() {
  // Fetch overall stats
  const {
    data: stats,
    isLoading: statsLoading,
    error: statsError,
  } = trpc.core.aiUsage.getStats.useQuery();

  // Fetch usage history
  const {
    data: history,
    isLoading: historyLoading,
    error: historyError,
  } = trpc.core.aiUsage.getHistory.useQuery({});

  // Loading state
  if (statsLoading || historyLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">AI Usage</h1>
          <p className="text-muted-foreground">Track AI categorization costs and usage</p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>

        <Skeleton className="h-96" />
      </div>
    );
  }

  // Error state
  if (statsError || historyError) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight">AI Usage</h1>
        <Alert variant="destructive">
          <h3 className="font-semibold">Failed to load AI usage data</h3>
          <p className="text-sm mt-1">
            {statsError?.message || historyError?.message || "Unknown error"}
          </p>
        </Alert>
      </div>
    );
  }

  // Define table columns
  const columns: ColumnDef<AiUsageRecord>[] = [
    {
      accessorKey: "date",
      header: ({ column }) => <SortableHeader column={column}>Date</SortableHeader>,
      cell: ({ row }) => {
        const date = new Date(row.original.date);
        return date.toLocaleDateString("en-AU", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        });
      },
    },
    {
      accessorKey: "apiCalls",
      header: ({ column }) => (
        <div className="flex justify-end">
          <SortableHeader column={column}>API Calls</SortableHeader>
        </div>
      ),
      cell: ({ row }) => (
        <div className="text-right font-mono tabular-nums">
          {row.original.apiCalls.toLocaleString()}
        </div>
      ),
    },
    {
      accessorKey: "cacheHits",
      header: ({ column }) => (
        <div className="flex justify-end">
          <SortableHeader column={column}>Cache Hits</SortableHeader>
        </div>
      ),
      cell: ({ row }) => (
        <div className="text-right font-mono tabular-nums">
          {row.original.cacheHits.toLocaleString()}
        </div>
      ),
    },
    {
      id: "cacheHitRate",
      header: () => <div className="text-right">Cache Hit Rate</div>,
      cell: ({ row }) => {
        const total = row.original.apiCalls + row.original.cacheHits;
        const rate = total > 0 ? (row.original.cacheHits / total) * 100 : 0;
        return (
          <div className="text-right">
            <Badge variant={rate > 80 ? "default" : rate > 50 ? "secondary" : "outline"}>
              {rate.toFixed(1)}%
            </Badge>
          </div>
        );
      },
    },
    {
      accessorKey: "inputTokens",
      header: ({ column }) => (
        <div className="flex justify-end">
          <SortableHeader column={column}>Input Tokens</SortableHeader>
        </div>
      ),
      cell: ({ row }) => (
        <div className="text-right font-mono text-sm tabular-nums">
          {row.original.inputTokens.toLocaleString()}
        </div>
      ),
    },
    {
      accessorKey: "outputTokens",
      header: ({ column }) => (
        <div className="flex justify-end">
          <SortableHeader column={column}>Output Tokens</SortableHeader>
        </div>
      ),
      cell: ({ row }) => (
        <div className="text-right font-mono text-sm tabular-nums">
          {row.original.outputTokens.toLocaleString()}
        </div>
      ),
    },
    {
      accessorKey: "cost",
      header: ({ column }) => (
        <div className="flex justify-end">
          <SortableHeader column={column}>Cost</SortableHeader>
        </div>
      ),
      cell: ({ row }) => (
        <div className="text-right font-mono font-medium tabular-nums">
          ${row.original.cost.toFixed(4)}
        </div>
      ),
    },
  ];

  // Calculate cache hit rate
  const totalRequests = (stats?.totalApiCalls ?? 0) + (stats?.totalCacheHits ?? 0);
  const cacheHitRate = totalRequests > 0 ? (stats?.cacheHitRate ?? 0) * 100 : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight">AI Usage</h1>
        <p className="text-muted-foreground">
          Track AI categorization costs and usage across all imports
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Total Cost"
          value={`$${(stats?.totalCost ?? 0).toFixed(4)}`}
          description={
            stats?.last30Days ? `$${stats.last30Days.cost.toFixed(4)} last 30 days` : undefined
          }
          color="amber"
        />

        <StatCard
          title="API Calls"
          value={(stats?.totalApiCalls ?? 0).toLocaleString()}
          description={
            stats?.last30Days
              ? `${stats.last30Days.apiCalls.toLocaleString()} last 30 days`
              : undefined
          }
          color="indigo"
        />

        <StatCard
          title="Cache Hit Rate"
          value={`${cacheHitRate.toFixed(1)}%`}
          description={`${(stats?.totalCacheHits ?? 0).toLocaleString()} cached results`}
          color="emerald"
        />

        <StatCard
          title="Avg Cost/Call"
          value={`$${(stats?.avgCostPerCall ?? 0).toFixed(5)}`}
          description={`${((stats?.totalInputTokens ?? 0) + (stats?.totalOutputTokens ?? 0)).toLocaleString()} total tokens`}
          color="sky"
        />
      </div>

      {/* Cache Management */}
      <CacheManagement />

      {/* Usage History Table */}
      {history && history.records.length > 0 ? (
        <div className="space-y-4">
          <div>
            <h2 className="text-xl font-semibold">Daily Usage History</h2>
            <p className="text-sm text-muted-foreground">
              Showing {history.records.length} days • Total: ${history.summary.totalCost.toFixed(4)}
            </p>
          </div>
          <DataTable columns={columns} data={history.records} />
        </div>
      ) : (
        <Card className="p-12 text-center">
          <p className="text-muted-foreground">No AI usage data yet</p>
          <p className="text-sm text-muted-foreground mt-2">
            AI categorization data will appear here after importing transactions
          </p>
        </Card>
      )}
    </div>
  );
}
