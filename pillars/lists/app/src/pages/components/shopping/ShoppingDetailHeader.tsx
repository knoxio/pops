import { useTranslation } from 'react-i18next';

import { ListDetailHeader } from '../../detail/ListDetailHeader.js';
import { ShoppingSortDropdown } from './ShoppingSortDropdown.js';

import type { ListItemRow, ListRow } from '../../detail/types.js';
import type { ShoppingSortMode } from './types.js';

/**
 * Shopping-specific header. Wraps the generic `ListDetailHeader` so the
 * title + kind chip + archived badge + three-dot Rename/Change
 * kind/Archive/Delete menu render identically to the generic kind paths —
 * then layers the shopping bulk-action row above (sort dropdown + Uncheck
 * all + Clear checked + caption).
 *
 * The sort dropdown collapses to icon-only via `compact` on mobile (CSS
 * controls the visibility classes); the bulk buttons get smaller padding
 * but stay visible so the touch target remains usable.
 */
export interface ShoppingDetailHeaderProps {
  list: ListRow;
  items: readonly ListItemRow[];
  sortMode: ShoppingSortMode;
  onSortChange: (mode: ShoppingSortMode) => void;
  onUncheckAll: () => void;
  onClearChecked: () => void;
  onRename: () => void;
  onChangeKind: () => void;
  onArchiveToggle: () => void;
  onDelete: () => void;
}

export function ShoppingDetailHeader(props: ShoppingDetailHeaderProps) {
  const { t } = useTranslation('lists');
  const total = props.items.length;
  const checked = props.items.filter((row) => row.checked === 1).length;
  const hasChecked = checked > 0;

  return (
    <div className="space-y-3">
      <ListDetailHeader
        list={props.list}
        onRename={props.onRename}
        onChangeKind={props.onChangeKind}
        onArchiveToggle={props.onArchiveToggle}
        onDelete={props.onDelete}
      />
      <div className="flex flex-wrap items-center gap-2">
        <div className="hidden sm:block">
          <ShoppingSortDropdown mode={props.sortMode} onChange={props.onSortChange} />
        </div>
        <div className="sm:hidden">
          <ShoppingSortDropdown mode={props.sortMode} onChange={props.onSortChange} compact />
        </div>
        <button
          type="button"
          onClick={props.onUncheckAll}
          disabled={!hasChecked}
          title={hasChecked ? '' : t('shopping.header.uncheckAll.empty')}
          className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
        >
          {t('shopping.header.uncheckAll.button')}
        </button>
        <button
          type="button"
          onClick={props.onClearChecked}
          disabled={!hasChecked}
          title={hasChecked ? '' : t('shopping.header.clearChecked.empty')}
          className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
        >
          {t('shopping.header.clearChecked.button')}
        </button>
        <span className="ml-auto text-xs text-muted-foreground" data-testid="shopping-caption">
          {t('shopping.header.caption', { total, checked })}
        </span>
      </div>
    </div>
  );
}
