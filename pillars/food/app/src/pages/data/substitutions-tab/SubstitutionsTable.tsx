import { useTranslation } from 'react-i18next';

import { SubstitutionRow } from './SubstitutionRow';

import type { HydratedSubstitutionView } from './substitution-wire-types.js';
import type { UpdateSubstitutionFormInput } from './types';

interface Props {
  rows: readonly HydratedSubstitutionView[];
  isLoading: boolean;
  isUpdating: boolean;
  isDeleting: boolean;
  rowError: string | null;
  onUpdate: (input: UpdateSubstitutionFormInput) => void;
  onDelete: (id: number) => void;
}

function TableHeaderRow() {
  const { t } = useTranslation('food');
  return (
    <tr className="text-muted-foreground text-xs uppercase">
      <th className="px-3 py-2">{t('data.substitutions.table.from')}</th>
      <th className="px-3 py-2">{t('data.substitutions.table.to')}</th>
      <th className="px-3 py-2">{t('data.substitutions.table.ratio')}</th>
      <th className="px-3 py-2">{t('data.substitutions.table.scope')}</th>
      <th className="px-3 py-2">{t('data.substitutions.table.contextTags')}</th>
      <th className="px-3 py-2">{t('data.substitutions.table.created')}</th>
      <th className="px-3 py-2 text-right">{t('data.substitutions.table.actions')}</th>
    </tr>
  );
}

export function SubstitutionsTable({
  rows,
  isLoading,
  isUpdating,
  isDeleting,
  rowError,
  onUpdate,
  onDelete,
}: Props) {
  const { t } = useTranslation('food');
  if (isLoading) {
    return <p className="text-muted-foreground text-sm">{t('data.substitutions.loading')}</p>;
  }
  if (rows.length === 0) {
    return <p className="text-muted-foreground text-sm">{t('data.substitutions.empty')}</p>;
  }
  return (
    <div className="overflow-x-auto">
      {rowError !== null ? (
        <p role="alert" className="text-destructive mb-2 text-sm">
          {rowError}
        </p>
      ) : null}
      <table
        aria-label={t('data.substitutions.table.ariaLabel')}
        className="w-full min-w-[600px] table-auto text-left"
      >
        <thead>
          <TableHeaderRow />
        </thead>
        <tbody>
          {rows.map((row) => (
            <SubstitutionRow
              key={row.id}
              row={row}
              isUpdating={isUpdating}
              isDeleting={isDeleting}
              onUpdate={onUpdate}
              onDelete={onDelete}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}
