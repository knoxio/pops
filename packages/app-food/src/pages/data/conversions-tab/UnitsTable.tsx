/**
 * Read-only table render for the unit-conversions section. Action buttons
 * (edit + delete) are delegated to the parent so this file stays focused
 * on layout + the seeded-row affordance.
 */
import { useTranslation } from 'react-i18next';

import { Button, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@pops/ui';

import { SeededBadge } from './SeededBadge';

import type { UnitConversionRow } from './types';

interface Props {
  rows: readonly UnitConversionRow[];
  isLoading: boolean;
  onEdit: (row: UnitConversionRow) => void;
  onDelete: (row: UnitConversionRow) => void;
}

function NotesCell({ notes }: { notes: string | null }) {
  return <span className="text-muted-foreground text-sm">{notes ?? '—'}</span>;
}

function DeleteButton({
  row,
  onDelete,
  deleteLabel,
  seededTooltip,
}: {
  row: UnitConversionRow;
  onDelete: (row: UnitConversionRow) => void;
  deleteLabel: string;
  seededTooltip: string;
}) {
  if (row.seeded) {
    return (
      <Button size="sm" variant="ghost" disabled title={seededTooltip} aria-label={seededTooltip}>
        {deleteLabel}
      </Button>
    );
  }
  return (
    <Button size="sm" variant="ghost" onClick={() => onDelete(row)}>
      {deleteLabel}
    </Button>
  );
}

function UnitRow({
  row,
  onEdit,
  onDelete,
  editLabel,
  deleteLabel,
  seededTooltip,
}: {
  row: UnitConversionRow;
  onEdit: (row: UnitConversionRow) => void;
  onDelete: (row: UnitConversionRow) => void;
  editLabel: string;
  deleteLabel: string;
  seededTooltip: string;
}) {
  return (
    <TableRow data-testid={`unit-row-${row.id}`}>
      <TableCell className="flex items-center gap-2 font-medium">
        {row.fromUnit}
        {row.seeded ? <SeededBadge /> : null}
      </TableCell>
      <TableCell>{row.toUnit}</TableCell>
      <TableCell className="text-right tabular-nums">{row.ratio}</TableCell>
      <TableCell>
        <NotesCell notes={row.notes} />
      </TableCell>
      <TableCell className="flex justify-end gap-1">
        <Button size="sm" variant="ghost" onClick={() => onEdit(row)}>
          {editLabel}
        </Button>
        <DeleteButton
          row={row}
          onDelete={onDelete}
          deleteLabel={deleteLabel}
          seededTooltip={seededTooltip}
        />
      </TableCell>
    </TableRow>
  );
}

export function UnitsTable({ rows, isLoading, onEdit, onDelete }: Props) {
  const { t } = useTranslation('food');
  if (isLoading)
    return <p className="text-muted-foreground text-sm">{t('data.conversions.loading')}</p>;
  if (rows.length === 0)
    return <p className="text-muted-foreground text-sm">{t('data.conversions.units.empty')}</p>;
  const editLabel = t('data.conversions.edit');
  const deleteLabel = t('data.conversions.delete');
  const seededTooltip = t('data.conversions.units.seededDeleteTooltip');
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t('data.conversions.units.fields.from')}</TableHead>
          <TableHead>{t('data.conversions.units.fields.to')}</TableHead>
          <TableHead className="text-right">{t('data.conversions.units.fields.ratio')}</TableHead>
          <TableHead>{t('data.conversions.units.fields.notes')}</TableHead>
          <TableHead className="text-right">{t('data.conversions.actions')}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <UnitRow
            key={row.id}
            row={row}
            onEdit={onEdit}
            onDelete={onDelete}
            editLabel={editLabel}
            deleteLabel={deleteLabel}
            seededTooltip={seededTooltip}
          />
        ))}
      </TableBody>
    </Table>
  );
}
