import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import { Card } from '@pops/ui';

import type { HistoryRecord } from './types';

type CostPoint = { date: string; cost: number; calls: number };

function CostTooltipBody({
  active,
  payload,
}: {
  active?: boolean;
  payload?: readonly { payload?: CostPoint }[];
}) {
  if (!active || !payload?.length) return null;
  const item = payload[0]?.payload;
  if (!item) return null;
  return (
    <div className="rounded-lg border bg-background p-2 shadow-md text-sm">
      <p className="font-medium">{item.date}</p>
      <p className="text-amber-600">Cost: ${item.cost.toFixed(4)}</p>
      <p className="text-muted-foreground">{item.calls} calls</p>
    </div>
  );
}

export function DailyCostChart({ data }: { data: HistoryRecord[] }) {
  const chartData = [...data]
    .toSorted((a, b) => a.date.localeCompare(b.date))
    .map((d) => ({
      date: new Date(d.date).toLocaleDateString('en-AU', { day: '2-digit', month: 'short' }),
      cost: d.costUsd,
      calls: d.calls,
    }));

  if (chartData.length === 0) return null;

  return (
    <Card className="p-4">
      <h3 className="font-semibold mb-4">Daily Cost</h3>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={chartData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 12 }}
            className="fill-muted-foreground"
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            tick={{ fontSize: 12 }}
            className="fill-muted-foreground"
            tickFormatter={(v: number) => `$${v.toFixed(3)}`}
            tickLine={false}
            axisLine={false}
            width={60}
          />
          <Tooltip
            content={(props) => <CostTooltipBody active={props.active} payload={props.payload} />}
          />
          <Bar dataKey="cost" fill="var(--color-chart-1)" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </Card>
  );
}
