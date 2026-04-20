import { MoreHorizontal, Pencil, Trash2 } from 'lucide-react';

import {
  Badge,
  Button,
  type ColumnFilter,
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuSeparator,
  SortableHeader,
} from '@pops/ui';

import { ENTITY_TYPES, type Entity } from './types';

import type { ColumnDef } from '@tanstack/react-table';

const nameColumn: ColumnDef<Entity> = {
  accessorKey: 'name',
  header: ({ column }) => <SortableHeader column={column}>Name</SortableHeader>,
  cell: ({ row }) => (
    <div className="flex items-center gap-2">
      <span className="font-medium">{row.original.name}</span>
      {row.original.transactionCount === 0 && (
        <Badge
          variant="outline"
          className="text-xs text-muted-foreground border-muted-foreground/30"
        >
          Orphaned
        </Badge>
      )}
    </div>
  ),
};

const typeColumn: ColumnDef<Entity> = {
  accessorKey: 'type',
  header: 'Type',
  cell: ({ row }) => {
    const type = row.original.type;
    if (!type) return <span className="text-muted-foreground">—</span>;
    return (
      <Badge variant="outline" className="text-xs capitalize">
        {type}
      </Badge>
    );
  },
};

const abnColumn: ColumnDef<Entity> = {
  accessorKey: 'abn',
  header: 'ABN',
  cell: ({ row }) => (
    <span className="text-sm font-mono">
      {row.original.abn || <span className="text-muted-foreground">—</span>}
    </span>
  ),
};

const aliasesColumn: ColumnDef<Entity> = {
  accessorKey: 'aliases',
  header: 'Aliases',
  cell: ({ row }) => {
    const aliases = row.original.aliases;
    if (!aliases || aliases.length === 0) return <span className="text-muted-foreground">—</span>;
    return (
      <div className="flex flex-wrap gap-1">
        {aliases.slice(0, 2).map((alias) => (
          <Badge key={alias} variant="secondary" className="text-xs">
            {alias}
          </Badge>
        ))}
        {aliases.length > 2 && (
          <Badge variant="secondary" className="text-xs">
            +{aliases.length - 2}
          </Badge>
        )}
      </div>
    );
  },
  filterFn: (row, columnId, filterValue) => {
    const searchTerm = String(filterValue ?? '')
      .toLowerCase()
      .trim();
    if (!searchTerm) return true;
    const aliases = row.getValue<string[]>(columnId);
    if (!aliases || aliases.length === 0) return false;
    return aliases.some((alias) => alias.toLowerCase().includes(searchTerm));
  },
};

const defaultTypeColumn: ColumnDef<Entity> = {
  accessorKey: 'defaultTransactionType',
  header: 'Default Type',
  cell: ({ row }) => {
    const defaultType = row.original.defaultTransactionType;
    if (!defaultType) return <span className="text-muted-foreground">—</span>;
    return (
      <Badge variant="outline" className="text-xs">
        {defaultType}
      </Badge>
    );
  },
};

const defaultTagsColumn: ColumnDef<Entity> = {
  accessorKey: 'defaultTags',
  header: 'Default Tags',
  cell: ({ row }) => {
    const tags = row.original.defaultTags;
    if (tags.length === 0) return <span className="text-muted-foreground">—</span>;
    return (
      <div className="flex flex-wrap gap-1">
        {tags.map((tag) => (
          <Badge key={tag} variant="secondary" className="text-xs">
            {tag}
          </Badge>
        ))}
      </div>
    );
  },
};

function buildActionsColumn(args: {
  onEdit: (entity: Entity) => void;
  onDelete: (id: string) => void;
}): ColumnDef<Entity> {
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

export function buildEntityColumns(args: {
  onEdit: (entity: Entity) => void;
  onDelete: (id: string) => void;
}): ColumnDef<Entity>[] {
  return [
    nameColumn,
    typeColumn,
    abnColumn,
    aliasesColumn,
    defaultTypeColumn,
    defaultTagsColumn,
    buildActionsColumn(args),
  ];
}

export const ENTITY_TABLE_FILTERS: ColumnFilter[] = [
  {
    id: 'type',
    type: 'select',
    label: 'Type',
    options: [
      { label: 'All Types', value: '' },
      ...ENTITY_TYPES.map((t) => ({ label: t.charAt(0).toUpperCase() + t.slice(1), value: t })),
    ],
  },
];
