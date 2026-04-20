import { ExternalLink, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';

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

import type { WishlistItem } from './types';

function priorityVariant(priority: string): 'default' | 'secondary' | 'outline' {
  if (priority === 'Needing') return 'default';
  if (priority === 'Soon') return 'secondary';
  return 'outline';
}

const itemColumn: ColumnDef<WishlistItem> = {
  accessorKey: 'item',
  header: ({ column }) => <SortableHeader column={column}>Item</SortableHeader>,
  cell: ({ row }) => (
    <div className="flex flex-col">
      <span className="font-medium">{row.original.item}</span>
      {row.original.url && (
        <a
          href={row.original.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
        >
          Link <ExternalLink className="h-3 w-3" />
        </a>
      )}
    </div>
  ),
};

const priorityColumn: ColumnDef<WishlistItem> = {
  accessorKey: 'priority',
  header: 'Priority',
  cell: ({ row }) => {
    const priority = row.original.priority;
    if (!priority) return <span className="text-muted-foreground">—</span>;
    return <Badge variant={priorityVariant(priority)}>{priority}</Badge>;
  },
};

function formatCurrency(amount: number): string {
  return amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function makeAmountColumn(
  label: string,
  key: 'targetAmount' | 'saved',
  textClass = ''
): ColumnDef<WishlistItem> {
  return {
    accessorKey: key,
    header: ({ column }) => (
      <div className="flex justify-end">
        <SortableHeader column={column}>{label}</SortableHeader>
      </div>
    ),
    cell: ({ row }) => {
      const amount = row.original[key];
      if (amount === null) return <div className="text-right text-muted-foreground">—</div>;
      return (
        <div className={`text-right font-mono font-medium tabular-nums ${textClass}`}>
          ${formatCurrency(amount)}
        </div>
      );
    },
  };
}

const progressColumn: ColumnDef<WishlistItem> = {
  id: 'progress',
  header: 'Progress',
  cell: ({ row }) => {
    const { targetAmount, saved } = row.original;
    if (targetAmount === null || saved === null || targetAmount === 0) {
      return <span className="text-muted-foreground">—</span>;
    }
    const percentage = Math.min(100, Math.round((saved / targetAmount) * 100));
    return (
      <div className="flex items-center gap-2 min-w-30">
        <Progress value={percentage} className="h-2 flex-1" />
        <span className="text-xs font-medium tabular-nums w-10 text-right">{percentage}%</span>
      </div>
    );
  },
};

function buildActionsColumn(args: {
  onEdit: (item: WishlistItem) => void;
  onDelete: (id: string) => void;
}): ColumnDef<WishlistItem> {
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
            <Pencil className="mr-2 h-4 w-4" /> Edit
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            onClick={() => args.onDelete(row.original.id)}
          >
            <Trash2 className="mr-2 h-4 w-4" /> Delete
          </DropdownMenuItem>
        </DropdownMenu>
      </div>
    ),
  };
}

export function buildWishlistColumns(args: {
  onEdit: (item: WishlistItem) => void;
  onDelete: (id: string) => void;
}): ColumnDef<WishlistItem>[] {
  return [
    itemColumn,
    priorityColumn,
    makeAmountColumn('Target', 'targetAmount'),
    makeAmountColumn('Saved', 'saved', 'text-app-accent'),
    progressColumn,
    buildActionsColumn(args),
  ];
}

export const WISHLIST_TABLE_FILTERS: ColumnFilter[] = [
  {
    id: 'priority',
    type: 'select',
    label: 'Priority',
    options: [
      { label: 'All Priorities', value: '' },
      { label: 'Needing', value: 'Needing' },
      { label: 'Soon', value: 'Soon' },
      { label: 'One Day', value: 'One Day' },
      { label: 'Dreaming', value: 'Dreaming' },
    ],
  },
];
