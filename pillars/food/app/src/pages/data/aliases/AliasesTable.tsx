/**
 * Aliases table.
 *
 * Sortable header + per-row checkbox + inline edit + delete. Each
 * column header is a button that flips between asc/desc on the same key
 * and resets to asc when the key changes (per `use-aliases-data`).
 */
import { ArrowDown, ArrowUp } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Checkbox, Table, TableBody, TableHead, TableHeader, TableRow } from '@pops/ui';

import { AliasesTableRow } from './AliasesTableRow.js';

import type { AliasRow, AliasSortKey, SortState } from './types.js';

export interface AliasesTableProps {
  readonly rows: readonly AliasRow[];
  readonly sort: SortState;
  readonly onSortChange: (key: AliasSortKey) => void;
  readonly selectedIds: ReadonlySet<number>;
  readonly onToggleSelection: (id: number) => void;
  readonly onSelectAll: () => void;
  readonly onClearSelection: () => void;
  readonly onUpdateAlias: (id: number, alias: string) => void;
  readonly onDeleteAlias: (id: number) => void;
}

export function AliasesTable(props: AliasesTableProps) {
  const { t } = useTranslation('food');
  const { rows, sort, selectedIds, onSelectAll, onClearSelection } = props;
  const allSelected = rows.length > 0 && rows.every((r) => selectedIds.has(r.id));

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-10">
            <Checkbox
              aria-label={t('data.aliases.row.selectAllAria')}
              checked={allSelected}
              onCheckedChange={(next) => (next === true ? onSelectAll() : onClearSelection())}
            />
          </TableHead>
          <SortableHeader sort={sort} sortKey="alias" onSortChange={props.onSortChange}>
            <ColumnLabel keyName="alias" />
          </SortableHeader>
          <SortableHeader sort={sort} sortKey="target" onSortChange={props.onSortChange}>
            <ColumnLabel keyName="target" />
          </SortableHeader>
          <SortableHeader sort={sort} sortKey="source" onSortChange={props.onSortChange}>
            <ColumnLabel keyName="source" />
          </SortableHeader>
          <SortableHeader sort={sort} sortKey="createdAt" onSortChange={props.onSortChange}>
            <ColumnLabel keyName="createdAt" />
          </SortableHeader>
          <TableHead aria-hidden="true" className="w-32" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <AliasesTableRow
            key={row.id}
            row={row}
            selected={selectedIds.has(row.id)}
            onToggleSelection={props.onToggleSelection}
            onUpdateAlias={props.onUpdateAlias}
            onDeleteAlias={props.onDeleteAlias}
          />
        ))}
      </TableBody>
    </Table>
  );
}

interface SortableHeaderProps {
  readonly sort: SortState;
  readonly sortKey: AliasSortKey;
  readonly onSortChange: (key: AliasSortKey) => void;
  readonly children: React.ReactNode;
}

function ariaSortFor(sort: SortState, sortKey: AliasSortKey): 'none' | 'ascending' | 'descending' {
  if (sort.key !== sortKey) return 'none';
  return sort.direction === 'asc' ? 'ascending' : 'descending';
}

function SortableHeader({ sort, sortKey, onSortChange, children }: SortableHeaderProps) {
  const isActive = sort.key === sortKey;
  return (
    <TableHead aria-sort={ariaSortFor(sort, sortKey)}>
      <button
        type="button"
        onClick={() => onSortChange(sortKey)}
        className="hover:text-foreground flex items-center gap-1"
      >
        {children}
        {isActive ? <SortArrow direction={sort.direction} /> : null}
      </button>
    </TableHead>
  );
}

function SortArrow({ direction }: { direction: SortState['direction'] }) {
  if (direction === 'asc') return <ArrowUp className="h-3 w-3" aria-hidden="true" />;
  return <ArrowDown className="h-3 w-3" aria-hidden="true" />;
}

function ColumnLabel({ keyName }: { keyName: AliasSortKey }) {
  const { t } = useTranslation('food');
  return <span>{t(`data.aliases.columns.${keyName}`)}</span>;
}
