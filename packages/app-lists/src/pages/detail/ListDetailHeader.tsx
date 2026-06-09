import { useTranslation } from 'react-i18next';

import { ListDetailMenu } from './ListDetailMenu.js';
import { ListKindChip } from './ListKindChip.js';

import type { ListRow } from './types.js';

/**
 * Header row for the detail page. Surfaces the list name, kind chip,
 * archived badge (when applicable), and the three-dot action menu.
 */
export interface ListDetailHeaderProps {
  list: ListRow;
  onRename: () => void;
  onChangeKind: () => void;
  onArchiveToggle: () => void;
  onDelete: () => void;
}

export function ListDetailHeader(props: ListDetailHeaderProps) {
  const { t } = useTranslation('lists');
  const isArchived = props.list.archivedAt !== null;

  return (
    <header className="flex flex-wrap items-start justify-between gap-3 border-b pb-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold tracking-tight">{props.list.name}</h1>
        <ListKindChip kind={props.list.kind} />
        {isArchived ? (
          <span
            className="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground"
            data-testid="archived-badge"
          >
            {t('detail.archivedBadge')}
          </span>
        ) : null}
      </div>
      <ListDetailMenu
        isArchived={isArchived}
        onRename={props.onRename}
        onChangeKind={props.onChangeKind}
        onArchiveToggle={props.onArchiveToggle}
        onDelete={props.onDelete}
      />
    </header>
  );
}
