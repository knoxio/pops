import { MoreHorizontal, Pencil, Trash2 } from 'lucide-react';

import {
  Badge,
  Button,
  type ColumnFilter,
  dateRangeFilter,
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuSeparator,
  SortableHeader,
} from '@pops/ui';

import { TagEditor } from '../../components/TagEditor';

import type { ColumnDef } from '@tanstack/react-table';

import type { Transaction } from './types';

export type { Transaction } from './types';

interface BuildColumnsArgs {
  availableTags: string[];
  onTagSave: (
    id: string,
    entityId: string | null,
    description: string
  ) => (tags: string[]) => Promise<void>;
  onTagSuggest: (description: string, entityId: string | null) => () => Promise<string[]>;
  onEdit: (transaction: Transaction) => void;
  onDelete: (id: string) => void;
}

const dateColumn: ColumnDef<Transaction> = {
  accessorKey: 'date',
  header: ({ column }) => <SortableHeader column={column}>Date</SortableHeader>,
  cell: ({ row }) =>
    new Date(row.original.date).toLocaleDateString('en-AU', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }),
  filterFn: dateRangeFilter,
};

const descriptionColumn: ColumnDef<Transaction> = {
  accessorKey: 'description',
  header: 'Description',
  cell: ({ row }) => (
    <div className="max-w-md">
      <div className="font-medium truncate">{row.original.description}</div>
      {row.original.entityName && (
        <div className="text-sm text-muted-foreground truncate">{row.original.entityName}</div>
      )}
    </div>
  ),
};

const accountColumn: ColumnDef<Transaction> = {
  accessorKey: 'account',
  header: 'Account',
  cell: ({ row }) => <span className="text-sm font-mono">{row.original.account}</span>,
};

const amountColumn: ColumnDef<Transaction> = {
  accessorKey: 'amount',
  header: ({ column }) => (
    <div className="flex justify-end">
      <SortableHeader column={column}>Amount</SortableHeader>
    </div>
  ),
  cell: ({ row }) => {
    const amount = row.original.amount;
    const isNegative = amount < 0;
    return (
      <div className="text-right font-mono font-medium tabular-nums">
        <span className={isNegative ? 'text-destructive' : 'text-success'}>
          {isNegative ? '-' : '+'}${Math.abs(amount).toFixed(2)}
        </span>
      </div>
    );
  },
};

const typeColumn: ColumnDef<Transaction> = {
  accessorKey: 'type',
  header: 'Type',
  cell: ({ row }) => (
    <Badge variant="outline" className="text-xs">
      {row.original.type}
    </Badge>
  ),
};

function tagsFilterFn(
  row: { getValue: <T>(id: string) => T },
  columnId: string,
  filterValue: unknown
): boolean {
  const searchTerm = String(filterValue ?? '')
    .toLowerCase()
    .trim();
  if (!searchTerm) return true;
  const tags = row.getValue<string[]>(columnId);
  if (!tags || tags.length === 0) return false;
  return tags.some((tag) => tag.toLowerCase().includes(searchTerm));
}

function buildTagsColumn(args: BuildColumnsArgs): ColumnDef<Transaction> {
  const { availableTags, onTagSave, onTagSuggest } = args;
  return {
    accessorKey: 'tags',
    header: 'Tags',
    cell: ({ row }) => {
      const { id, tags, entityId, description } = row.original;
      return (
        <TagEditor
          currentTags={tags}
          onSave={onTagSave(id, entityId, description)}
          onSuggest={onTagSuggest(description, entityId)}
          availableTags={availableTags}
        />
      );
    },
    filterFn: tagsFilterFn,
  };
}

function buildActionsColumn(args: BuildColumnsArgs): ColumnDef<Transaction> {
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

export function buildColumns(args: BuildColumnsArgs): ColumnDef<Transaction>[] {
  return [
    dateColumn,
    descriptionColumn,
    accountColumn,
    amountColumn,
    typeColumn,
    buildTagsColumn(args),
    buildActionsColumn(args),
  ];
}

export const TRANSACTION_TABLE_FILTERS: ColumnFilter[] = [
  {
    id: 'date',
    type: 'daterange',
    label: 'Date Range',
  },
  {
    id: 'account',
    type: 'select',
    label: 'Account',
    options: [
      { label: 'All Accounts', value: '' },
      { label: 'ANZ Everyday', value: 'ANZ Everyday' },
      { label: 'ANZ Savings', value: 'ANZ Savings' },
      { label: 'Amex', value: 'Amex' },
      { label: 'ING Savings', value: 'ING Savings' },
      { label: 'Up Everyday', value: 'Up Everyday' },
    ],
  },
  {
    id: 'type',
    type: 'select',
    label: 'Type',
    options: [
      { label: 'All Types', value: '' },
      { label: 'Income', value: 'Income' },
      { label: 'Expense', value: 'Expense' },
      { label: 'Transfer', value: 'Transfer' },
    ],
  },
  {
    id: 'tags',
    type: 'text',
    label: 'Tag',
    placeholder: 'Filter by tag...',
  },
];
