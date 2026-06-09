/**
 * Read-only table render for the ingredient-weights section. Rows arrive
 * sorted by `(ingredient_id, unit)` from the backend list query, so they
 * are effectively grouped by ingredient even though there are no
 * dedicated group headers — the first-column ingredient name carries it.
 */
import { useTranslation } from 'react-i18next';

import { Button, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@pops/ui';

import { SeededBadge } from './SeededBadge';

import type { IngredientWeightRow } from './types';

export interface WeightRowView {
  row: IngredientWeightRow;
  ingredientName: string;
  variantLabel: string;
}

interface Props {
  rows: readonly WeightRowView[];
  isLoading: boolean;
  onEdit: (row: IngredientWeightRow) => void;
  onDelete: (row: IngredientWeightRow) => void;
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
  row: IngredientWeightRow;
  onDelete: (row: IngredientWeightRow) => void;
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

function WeightRow({
  view,
  onEdit,
  onDelete,
  editLabel,
  deleteLabel,
  seededTooltip,
}: {
  view: WeightRowView;
  onEdit: (row: IngredientWeightRow) => void;
  onDelete: (row: IngredientWeightRow) => void;
  editLabel: string;
  deleteLabel: string;
  seededTooltip: string;
}) {
  const { row, ingredientName, variantLabel } = view;
  return (
    <TableRow data-testid={`weight-row-${row.id}`}>
      <TableCell className="flex items-center gap-2 font-medium">
        {ingredientName}
        {row.seeded ? <SeededBadge /> : null}
      </TableCell>
      <TableCell>{variantLabel}</TableCell>
      <TableCell>{row.unit}</TableCell>
      <TableCell className="text-right tabular-nums">{row.grams}</TableCell>
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

export function WeightsTable({ rows, isLoading, onEdit, onDelete }: Props) {
  const { t } = useTranslation('food');
  if (isLoading)
    return <p className="text-muted-foreground text-sm">{t('data.conversions.loading')}</p>;
  if (rows.length === 0)
    return <p className="text-muted-foreground text-sm">{t('data.conversions.weights.empty')}</p>;
  const editLabel = t('data.conversions.edit');
  const deleteLabel = t('data.conversions.delete');
  const seededTooltip = t('data.conversions.weights.seededDeleteTooltip');
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t('data.conversions.weights.fields.ingredient')}</TableHead>
          <TableHead>{t('data.conversions.weights.fields.variant')}</TableHead>
          <TableHead>{t('data.conversions.weights.fields.unit')}</TableHead>
          <TableHead className="text-right">{t('data.conversions.weights.fields.grams')}</TableHead>
          <TableHead>{t('data.conversions.weights.fields.notes')}</TableHead>
          <TableHead className="text-right">{t('data.conversions.actions')}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((view) => (
          <WeightRow
            key={view.row.id}
            view={view}
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
