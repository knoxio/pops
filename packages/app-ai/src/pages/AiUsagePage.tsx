/**
 * AI Usage page - view AI categorization costs and usage
 */
import { useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { trpc } from "../lib/trpc";
import { DataTable, SortableHeader, StatCard } from "@pops/ui";
import { Badge, Button } from "@pops/ui";
import { Alert } from "@pops/ui";
import { Skeleton } from "@pops/ui";
import { Card } from "@pops/ui";
import { X } from "lucide-react";

interface AiUsageRecord {
  date: string;
  apiCalls: number;
  cacheHits: number;
  inputTokens: number;
  outputTokens: number;
  cost: number;
}

export function AiUsagePage() {
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  // Fetch overall stats
  const {
    data: stats,
    isLoading: statsLoading,
    error: statsError,
  } = trpc.core.aiUsage.getStats.useQuery();

  // Fetch usage history with date range filter
  const {
    data: history,
    isLoading: historyLoading,
    error: historyError,
  } = trpc.core.aiUsage.getHistory.useQuery({
    startDate: startDate || undefined,
    endDate: endDate || undefined,
  });

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

      {/* Daily Cost Chart + History Table */}
      {history && history.records.length > 0 ? (
        <div className="space-y-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-xl font-semibold">Daily Usage History</h2>
              <p className="text-sm text-muted-foreground">
                Showing {history.records.length} days • Total: $
                {history.summary.totalCost.toFixed(4)}
              </p>
            </div>

            {/* Date range filter */}
            <div className="flex items-end gap-2">
              <div className="flex flex-col gap-1">
                <label htmlFor="start-date" className="text-xs text-muted-foreground">
                  From
                </label>
                <input
                  id="start-date"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="rounded-md border border-input bg-background px-3 py-1.5 text-sm"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="end-date" className="text-xs text-muted-foreground">
                  To
                </label>
                <input
                  id="end-date"
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="rounded-md border border-input bg-background px-3 py-1.5 text-sm"
                />
              </div>
              {(startDate || endDate) && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setStartDate("");
                    setEndDate("");
                  }}
                  aria-label="Clear date filter"
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>

          {/* Cost chart */}
          <Card className="p-4">
            <ResponsiveContainer width="100%" height={280}>
              <BarChart
                data={[...history.records].sort(
                  (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
                )}
                margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 12 }}
                  tickFormatter={(val: string) =>
                    new Date(val).toLocaleDateString("en-AU", { day: "2-digit", month: "short" })
                  }
                />
                <YAxis
                  tick={{ fontSize: 12 }}
                  tickFormatter={(val: number) => `$${val.toFixed(3)}`}
                />
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const d = payload[0]!.payload as AiUsageRecord;
                    return (
                      <div className="rounded-md border bg-popover p-3 text-sm shadow-md">
                        <p className="font-medium">
                          {new Date(d.date).toLocaleDateString("en-AU", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                          })}
                        </p>
                        <p className="mt-1 font-mono">${d.cost.toFixed(4)}</p>
                        <p className="text-muted-foreground">
                          {d.apiCalls.toLocaleString()} calls • {d.cacheHits.toLocaleString()}{" "}
                          cached
                        </p>
                      </div>
                    );
                  }}
                />
                <Bar dataKey="cost" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Card>

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
