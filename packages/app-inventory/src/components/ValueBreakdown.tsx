import { AlertCircle, RefreshCw, Tag } from 'lucide-react';
import { useNavigate } from 'react-router';
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

/**
 * Value breakdown cards — horizontal bar charts showing replacement value
 * grouped by item type or location.
 */
import { Alert, AlertDescription, Button, Card, CardContent, Skeleton } from '@pops/ui';

import { trpc } from '../lib/trpc';
import { formatCurrency } from '../lib/utils';

const BAR_COLORS = [
  'var(--primary)',
  'color-mix(in oklch, var(--primary) 80%, transparent)',
  'color-mix(in oklch, var(--primary) 60%, transparent)',
  'color-mix(in oklch, var(--primary) 45%, transparent)',
  'color-mix(in oklch, var(--primary) 30%, transparent)',
];

export interface BreakdownEntry {
  name: string;
  totalValue: number;
  itemCount: number;
  key?: string | null;
}

interface BreakdownChartProps {
  data: BreakdownEntry[];
  onBarClick?: (entry: BreakdownEntry) => void;
}

export function BreakdownChart({ data, onBarClick }: BreakdownChartProps) {
  if (data.length === 0) {
    return (
      <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
        No items with replacement values
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
          tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          type="category"
          dataKey="name"
          width={100}
          tick={{ fill: 'var(--foreground)', fontSize: 12 }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip
          content={({ payload }) => {
            if (!payload?.length) return null;
            const first = payload[0];
            if (!first) return null;
            const entry = first.payload as BreakdownEntry;
            const valueDisplay = entry.totalValue > 0 ? formatCurrency(entry.totalValue) : '—';
            return (
              <div className="rounded-md border bg-popover px-3 py-2 text-sm shadow-md">
                <p className="font-medium">{entry.name}</p>
                <p className="text-muted-foreground">
                  {valueDisplay} ({entry.itemCount} items)
                </p>
              </div>
            );
          }}
        />
        <Bar
          dataKey="totalValue"
          radius={[0, 4, 4, 0]}
          cursor={onBarClick ? 'pointer' : undefined}
          onClick={(entry) => {
            if (onBarClick && entry) {
              onBarClick(entry as unknown as BreakdownEntry);
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

  const typeEntries: BreakdownEntry[] = typeData?.data ?? [];

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
            onBarClick={(entry) => navigate(`/inventory?type=${encodeURIComponent(entry.name)}`)}
          />
        )}
      </CardContent>
    </Card>
  );
}
