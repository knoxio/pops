import { Pencil, Trash2 } from 'lucide-react';

import { Badge, Button, formatDate, SortableHeader } from '@pops/ui';

import { ConfidenceSlider } from '../../components/ConfidenceSlider';

import type { ColumnDef } from '@tanstack/react-table';

import type { Correction } from './types';

type BuildOptions = {
  onAutoDelete: (id: string) => void;
  onDeleteClick: (id: string) => void;
  onEditClick: (rule: Correction) => void;
};

const patternColumn: ColumnDef<Correction> = {
  accessorKey: 'descriptionPattern',
  header: ({ column }) => <SortableHeader column={column}>Pattern</SortableHeader>,
  cell: ({ row }) => <span className="font-mono text-sm">{row.original.descriptionPattern}</span>,
};

const matchTypeColumn: ColumnDef<Correction> = {
  accessorKey: 'matchType',
  header: 'Match Type',
  cell: ({ row }) => <Badge variant="outline">{row.original.matchType}</Badge>,
};

const entityColumn: ColumnDef<Correction> = {
  accessorKey: 'entityName',
  header: ({ column }) => <SortableHeader column={column}>Entity</SortableHeader>,
  cell: ({ row }) => row.original.entityName ?? <span className="text-muted-foreground">—</span>,
};

const timesAppliedColumn: ColumnDef<Correction> = {
  accessorKey: 'timesApplied',
  header: ({ column }) => (
    <div className="flex justify-end">
      <SortableHeader column={column}>Times Applied</SortableHeader>
    </div>
  ),
  cell: ({ row }) => <div className="text-right tabular-nums">{row.original.timesApplied}</div>,
};

const lastUsedColumn: ColumnDef<Correction> = {
  accessorKey: 'lastUsedAt',
  header: ({ column }) => <SortableHeader column={column}>Last Used</SortableHeader>,
  cell: ({ row }) =>
    row.original.lastUsedAt ? (
      formatDate(row.original.lastUsedAt)
    ) : (
      <span className="text-muted-foreground">Never</span>
    ),
};

function confidenceColumn(onAutoDelete: BuildOptions['onAutoDelete']): ColumnDef<Correction> {
  return {
    accessorKey: 'confidence',
    header: ({ column }) => <SortableHeader column={column}>Confidence</SortableHeader>,
    cell: ({ row }) => (
      <ConfidenceSlider
        key={`${row.original.id}-${row.original.confidence}`}
        ruleId={row.original.id}
        initial={row.original.confidence}
        onAutoDelete={onAutoDelete}
      />
    ),
  };
}

function actionsColumn(
  onDeleteClick: BuildOptions['onDeleteClick'],
  onEditClick: BuildOptions['onEditClick']
): ColumnDef<Correction> {
  return {
    id: 'actions',
    header: '',
    cell: ({ row }) => (
      <div className="flex items-center justify-end gap-1">
        <Button
          variant="ghost"
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            onEditClick(row.original);
          }}
          aria-label={`Edit rule ${row.original.descriptionPattern}`}
        >
          <Pencil className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            onDeleteClick(row.original.id);
          }}
          aria-label={`Delete rule ${row.original.descriptionPattern}`}
        >
          <Trash2 className="h-4 w-4 text-destructive" />
        </Button>
      </div>
    ),
  };
}

export function buildRulesColumns({
  onAutoDelete,
  onDeleteClick,
  onEditClick,
}: BuildOptions): ColumnDef<Correction>[] {
  return [
    patternColumn,
    matchTypeColumn,
    entityColumn,
    confidenceColumn(onAutoDelete),
    timesAppliedColumn,
    lastUsedColumn,
    actionsColumn(onDeleteClick, onEditClick),
  ];
}
