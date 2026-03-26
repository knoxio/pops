/**
 * ValueByTypeCard — horizontal bar chart showing replacement value
 * grouped by item type.
 */
import { Alert, AlertDescription, Button, Card, CardContent, Skeleton } from "@pops/ui";
import { AlertCircle, RefreshCw, Tag } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { useNavigate } from "react-router";
import { trpc } from "../lib/trpc";
import { formatCurrency } from "../lib/utils";

const BAR_COLORS = [
  "hsl(var(--primary))",
  "hsl(var(--primary) / 0.8)",
  "hsl(var(--primary) / 0.6)",
  "hsl(var(--primary) / 0.45)",
  "hsl(var(--primary) / 0.3)",
];

interface BreakdownChartProps {
  data: { name: string; totalValue: number; itemCount: number }[];
  onBarClick?: (name: string) => void;
}

function BreakdownChart({ data, onBarClick }: BreakdownChartProps) {
  if (data.length === 0) {
    return (
      <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
        No data available
      </div>
    );
  }

  const chartHeight = Math.max(120, data.length * 40 + 20);

  return (
    <ResponsiveContainer width="100%" height={chartHeight}>
      <BarChart data={data} layout="vertical" margin={{ left: 0, right: 16, top: 4, bottom: 4 }}>
        <XAxis
          type="number"
          tickFormatter={(v: number) => formatCurrency(v)}
          tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          type="category"
          dataKey="name"
          width={100}
          tick={{ fill: "hsl(var(--foreground))", fontSize: 12 }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip
          content={({ payload }) => {
            if (!payload?.length) return null;
            const entry = payload[0].payload as BreakdownChartProps["data"][number];
            return (
              <div className="rounded-md border bg-popover px-3 py-2 text-sm shadow-md">
                <p className="font-medium">{entry.name}</p>
                <p className="text-muted-foreground">
                  {formatCurrency(entry.totalValue)} ({entry.itemCount} items)
                </p>
              </div>
            );
          }}
        />
        <Bar
          dataKey="totalValue"
          radius={[0, 4, 4, 0]}
          cursor={onBarClick ? "pointer" : undefined}
          onClick={(entry) => {
            if (onBarClick && entry?.name) {
              onBarClick(entry.name as string);
            }
          }}
        >
          {data.map((_, idx) => (
            <Cell key={idx} fill={BAR_COLORS[idx % BAR_COLORS.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function ValueByTypeCard({ className }: { className?: string }) {
  const navigate = useNavigate();

  const {
    data: typeData,
    isLoading: typeLoading,
    isError: typeError,
    refetch: refetchType,
  } = trpc.inventory.reports.valueByType.useQuery();

  if (typeLoading) {
    return (
      <Card className={className}>
        <CardContent className="p-4 space-y-2">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-40 w-full" />
        </CardContent>
      </Card>
    );
  }

  const typeEntries = typeData?.data ?? [];

  return (
    <Card className={className}>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-muted-foreground mb-3">
          <Tag className="h-4 w-4" />
          <span className="text-xs font-medium">Value by Type</span>
        </div>
        {typeError ? (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription className="flex items-center justify-between gap-2">
              <span>Failed to load type breakdown</span>
              <Button variant="outline" size="sm" onClick={() => refetchType()}>
                <RefreshCw className="h-3 w-3 mr-1" />
                Retry
              </Button>
            </AlertDescription>
          </Alert>
        ) : (
          <BreakdownChart
            data={typeEntries}
            onBarClick={(name) => navigate(`/inventory?type=${encodeURIComponent(name)}`)}
          />
        )}
      </CardContent>
    </Card>
  );
}
