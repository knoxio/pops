import { DataTable, SortableHeader } from '@pops/ui';

import type { ColumnDef } from '@tanstack/react-table';

interface BreakdownRow {
  key: string;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

export function BreakdownTable({ title, data }: { title: string; data: BreakdownRow[] }) {
  const columns: ColumnDef<BreakdownRow>[] = [
    {
      accessorKey: 'key',
      header: title,
      cell: ({ row }) => <span className="font-mono text-sm">{row.original.key}</span>,
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
      id: 'tokens',
      header: () => <div className="text-right">Tokens</div>,
      cell: ({ row }) => (
        <div className="text-right text-sm tabular-nums text-muted-foreground">
          {(row.original.inputTokens + row.original.outputTokens).toLocaleString()}
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

  if (data.length === 0) return null;

  return (
    <div className="space-y-2">
      <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
        By {title}
      </h3>
      <DataTable columns={columns} data={data} />
    </div>
  );
}
