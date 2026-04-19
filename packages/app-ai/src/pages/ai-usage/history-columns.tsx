import { Badge, SortableHeader } from '@pops/ui';

import type { ColumnDef } from '@tanstack/react-table';

import type { HistoryRecord } from './types';

function formatHistoryDate(date: string) {
  return new Date(date).toLocaleDateString('en-AU', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function hitRateBadgeVariant(rate: number) {
  if (rate > 80) return 'default' as const;
  if (rate > 50) return 'secondary' as const;
  return 'outline' as const;
}

export function buildHistoryColumns(): ColumnDef<HistoryRecord>[] {
  return [
    {
      accessorKey: 'date',
      header: ({ column }) => <SortableHeader column={column}>Date</SortableHeader>,
      cell: ({ row }) => formatHistoryDate(row.original.date),
    },
    {
      accessorKey: 'calls',
      header: ({ column }) => (
        <div className="flex justify-end">
          <SortableHeader column={column}>Calls</SortableHeader>
        </div>
      ),
      cell: ({ row }) => (
        <div className="text-right tabular-nums">{row.original.calls.toLocaleString()}</div>
      ),
    },
    {
      accessorKey: 'cacheHits',
      header: () => <div className="text-right">Cache Hits</div>,
      cell: ({ row }) => (
        <div className="text-right tabular-nums">{row.original.cacheHits.toLocaleString()}</div>
      ),
    },
    {
      id: 'cacheRate',
      header: () => <div className="text-right">Hit Rate</div>,
      cell: ({ row }) => {
        const total = row.original.calls + row.original.cacheHits;
        const rate = total > 0 ? (row.original.cacheHits / total) * 100 : 0;
        return (
          <div className="text-right">
            <Badge variant={hitRateBadgeVariant(rate)}>{rate.toFixed(1)}%</Badge>
          </div>
        );
      },
    },
    {
      accessorKey: 'inputTokens',
      header: () => <div className="text-right">Input Tokens</div>,
      cell: ({ row }) => (
        <div className="text-right font-mono text-sm tabular-nums">
          {row.original.inputTokens.toLocaleString()}
        </div>
      ),
    },
    {
      accessorKey: 'outputTokens',
      header: () => <div className="text-right">Output Tokens</div>,
      cell: ({ row }) => (
        <div className="text-right font-mono text-sm tabular-nums">
          {row.original.outputTokens.toLocaleString()}
        </div>
      ),
    },
    {
      accessorKey: 'costUsd',
      header: ({ column }) => (
        <div className="flex justify-end">
          <SortableHeader column={column}>Cost</SortableHeader>
        </div>
      ),
      cell: ({ row }) => (
        <div className="text-right font-mono font-medium tabular-nums">
          ${row.original.costUsd.toFixed(4)}
        </div>
      ),
    },
  ];
}
