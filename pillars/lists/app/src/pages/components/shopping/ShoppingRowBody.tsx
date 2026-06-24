import { type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';

import type { ListItemRow as ItemRow } from '../../detail/types.js';

/**
 * Body of a `ShoppingItemRow` — always-visible qty/unit prefix, inline
 * label editor when active, and the notes-as-subline.
 */
export interface ShoppingRowBodyProps {
  row: ItemRow;
  isChecked: boolean;
  edit: {
    editing: boolean;
    draft: string;
    setDraft: (value: string) => void;
    begin: () => void;
    commit: () => Promise<void>;
  };
  onLabelKey: (e: KeyboardEvent<HTMLInputElement>) => void;
}

export function ShoppingRowBody(props: ShoppingRowBodyProps): React.ReactElement {
  const { t } = useTranslation('lists');
  const { row, isChecked, edit, onLabelKey } = props;
  return (
    <div className="min-w-0 flex-1">
      <div className="flex items-baseline gap-2">
        <span
          className={`min-w-14 text-sm tabular-nums ${
            isChecked ? 'text-muted-foreground' : 'text-foreground'
          }`}
          data-testid="qty-unit"
        >
          {formatQtyUnit(row)}
        </span>
        {edit.editing ? (
          <input
            type="text"
            value={edit.draft}
            onChange={(e) => edit.setDraft(e.target.value)}
            onBlur={() => void edit.commit()}
            onKeyDown={onLabelKey}
            className="flex-1 rounded border bg-background px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            aria-label={t('shopping.item.editLabel')}
            autoFocus
          />
        ) : (
          <button
            type="button"
            onClick={edit.begin}
            className={`flex-1 text-left text-sm ${
              isChecked ? 'text-muted-foreground line-through opacity-60' : ''
            }`}
          >
            {row.label}
          </button>
        )}
      </div>
      <Subline notes={row.notes} />
    </div>
  );
}

function Subline({ notes }: { notes: string | null }) {
  if (notes === null || notes.length === 0) return null;
  return (
    <p className="truncate text-xs text-muted-foreground" title={notes}>
      {notes}
    </p>
  );
}

function formatQtyUnit(row: ItemRow): string {
  const qty = row.qty;
  const unit = row.unit;
  if (qty === null && unit === null) return '—';
  const qtyText = qty === null ? '' : formatQty(qty);
  return unit === null ? qtyText : `${qtyText} ${unit}`.trim();
}

function formatQty(qty: number): string {
  return Number.isInteger(qty) ? String(qty) : qty.toFixed(2).replace(/\.?0+$/, '');
}
