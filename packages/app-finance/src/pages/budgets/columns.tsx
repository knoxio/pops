import { MoreHorizontal, Pencil, Trash2 } from 'lucide-react';

import {
  Badge,
  Button,
  type ColumnFilter,
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuSeparator,
  Progress,
  SortableHeader,
} from '@pops/ui';

import type { ColumnDef } from '@tanstack/react-table';

import type { Budget } from './types';

const categoryColumn: ColumnDef<Budget> = {
  accessorKey: 'category',
  header: ({ column }) => <SortableHeader column={column}>Category</SortableHeader>,
  cell: ({ row }) => <div className="font-medium">{row.original.category}</div>,
};

const periodColumn: ColumnDef<Budget> = {
  accessorKey: 'period',
  header: 'Period',
  cell: ({ row }) => {
    const period = row.original.period;
    if (!period) return <span className="text-muted-foreground">—</span>;
    return (
      <Badge
        variant="outline"
        className={
          period === 'Monthly'
            ? 'bg-info/10 text-info border-info/20 dark:text-info/80'
            : 'bg-amber-500/10 text-amber-700 border-amber-500/20 dark:text-amber-400'
        }
      >
        {period}
      </Badge>
    );
  },
};

const amountColumn: ColumnDef<Budget> = {
  accessorKey: 'amount',
  header: ({ column }) => (
    <div className="flex justify-end">
      <SortableHeader column={column}>Amount</SortableHeader>
    </div>
  ),
  cell: ({ row }) => {
    const amount = row.original.amount;
    if (amount === null) return <div className="text-right text-muted-foreground">—</div>;
    return (
      <div className="text-right font-mono font-medium tabular-nums">${amount.toFixed(2)}</div>
    );
  },
};

const spentColumn: ColumnDef<Budget> = {
  accessorKey: 'spent',
  header: ({ column }) => (
    <div className="flex justify-end">
      <SortableHeader column={column}>Spent</SortableHeader>
    </div>
  ),
  cell: ({ row }) => {
    const { spent, amount } = row.original;
    const overBudget = amount !== null && spent > amount;
    return (
      <div className="flex justify-end">
        <Badge variant={overBudget ? 'destructive' : 'default'} className="font-mono tabular-nums">
          ${spent.toFixed(2)}
        </Badge>
      </div>
    );
  },
};

/**
 * Percentage of the budget consumed by `spent`. Renders a `Progress` bar
 * capped visually at 100% (overage already surfaced via the Spent badge),
 * with the numeric percentage alongside. Falls back to "—" when the budget
 * has no target amount to compare against.
 */
const progressColumn: ColumnDef<Budget> = {
  id: 'progress',
  header: '% Progress',
  cell: ({ row }) => {
    const { spent, amount } = row.original;
    if (amount === null || amount <= 0) {
      return <span className="text-muted-foreground">—</span>;
    }
    const pct = (spent / amount) * 100;
    const display = Math.round(pct);
    const visual = Math.min(100, Math.max(0, pct));
    return (
      <div className="flex min-w-[120px] items-center gap-2">
        <Progress value={visual} className="flex-1" />
        <span
          className={`w-12 text-right font-mono text-xs tabular-nums ${
            pct > 100 ? 'text-destructive' : 'text-muted-foreground'
          }`}
        >
          {display}%
        </span>
      </div>
    );
  },
};

const statusColumn: ColumnDef<Budget> = {
  accessorKey: 'active',
  header: 'Status',
  cell: ({ row }) => (
    <Badge variant={row.original.active ? 'default' : 'secondary'} className="text-xs">
      {row.original.active ? 'Active' : 'Inactive'}
    </Badge>
  ),
  filterFn: (row, columnId, filterValue) => {
    if (filterValue === undefined || filterValue === null || filterValue === '') return true;
    const value = row.getValue<boolean>(columnId);
    return value === (filterValue === 'true');
  },
};

const notesColumn: ColumnDef<Budget> = {
  accessorKey: 'notes',
  header: 'Notes',
  cell: ({ row }) => {
    const notes = row.original.notes;
    if (!notes) return <span className="text-muted-foreground">—</span>;
    return <div className="max-w-md text-sm truncate text-muted-foreground">{notes}</div>;
  },
};

function buildActionsColumn(args: {
  onEdit: (b: Budget) => void;
  onDelete: (id: string) => void;
}): ColumnDef<Budget> {
  return {
    id: 'actions',
    cell: ({ row }) => (
      <div className="text-right">
        <DropdownMenu
          trigger={
            <Button variant="ghost" size="icon" aria-label="Actions">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          }
          align="end"
        >
          <DropdownMenuItem onClick={() => args.onEdit(row.original)}>
            <Pencil /> Edit
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            onClick={() => args.onDelete(row.original.id)}
          >
            <Trash2 /> Delete
          </DropdownMenuItem>
        </DropdownMenu>
      </div>
    ),
  };
}

export function buildBudgetColumns(args: {
  onEdit: (b: Budget) => void;
  onDelete: (id: string) => void;
}): ColumnDef<Budget>[] {
  return [
    categoryColumn,
    periodColumn,
    amountColumn,
    spentColumn,
    progressColumn,
    statusColumn,
    notesColumn,
    buildActionsColumn(args),
  ];
}

export const BUDGET_TABLE_FILTERS: ColumnFilter[] = [
  {
    id: 'period',
    type: 'select',
    label: 'Period',
    options: [
      { label: 'All Periods', value: '' },
      { label: 'Monthly', value: 'Monthly' },
      { label: 'Yearly', value: 'Yearly' },
    ],
  },
  {
    id: 'active',
    type: 'select',
    label: 'Status',
    options: [
      { label: 'All', value: '' },
      { label: 'Active', value: 'true' },
      { label: 'Inactive', value: 'false' },
    ],
  },
];
