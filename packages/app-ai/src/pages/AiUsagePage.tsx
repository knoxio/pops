/**
 * AI Usage page - view AI categorization costs and usage
 */
import type { ColumnDef } from "@tanstack/react-table";
import { trpc } from "../lib/trpc";
import { DataTable, SortableHeader, StatCard } from "@pops/ui";
import { Badge } from "@pops/ui";
import { Alert } from "@pops/ui";
import { Skeleton } from "@pops/ui";
import { Card } from "@pops/ui";

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
