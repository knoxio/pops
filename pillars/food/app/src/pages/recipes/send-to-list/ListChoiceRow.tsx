import { formatDistanceToNowStrict, parseISO } from 'date-fns';
/**
 * Single row in the existing-list picker (pillars/food/docs/prds/send-to-list).
 *
 * The already-sent badge is a soft warning — it never blocks selection.
 */
import { type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';

import type { ShoppingList } from './useSendToListData.js';

interface Props {
  list: ShoppingList;
  selected: boolean;
  wasSentBefore: boolean;
  onSelect: () => void;
}

export function ListChoiceRow({ list, selected, wasSentBefore, onSelect }: Props): ReactElement {
  const { t } = useTranslation('food');
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={selected}
        className={`flex w-full items-center gap-2 rounded border px-2 py-1 text-left text-sm hover:bg-muted ${
          selected ? 'border-primary bg-muted' : 'border-transparent'
        }`}
      >
        <span className="flex-1 truncate">{list.name}</span>
        <span className="text-xs text-muted-foreground">
          {t('recipes.detail.sendToList.picker.itemCount', { count: list.itemCount })}
        </span>
        <span className="text-xs text-muted-foreground">{relativeTime(list.lastUpdatedAt)}</span>
        {wasSentBefore && (
          <span className="rounded bg-amber-100 px-1 text-xs text-amber-900">
            {t('recipes.detail.sendToList.picker.alreadySent')}
          </span>
        )}
      </button>
    </li>
  );
}

function relativeTime(iso: string): string {
  if (iso === '') return '';
  return formatDistanceToNowStrict(parseISO(iso), { addSuffix: true });
}
