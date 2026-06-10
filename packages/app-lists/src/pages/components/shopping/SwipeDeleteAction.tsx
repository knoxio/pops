import { useTranslation } from 'react-i18next';

/**
 * Swipe-revealed action pair (Cancel + Delete) for a shopping row.
 * Extracted so `ShoppingItemRow` stays under the per-file lint cap and
 * so the buttons can be unit-tested independently.
 */
export interface SwipeDeleteActionProps {
  onCancel: () => void;
  onDelete: () => void;
}

export function SwipeDeleteAction(props: SwipeDeleteActionProps): React.ReactElement {
  const { t } = useTranslation('lists');
  return (
    <div className="flex gap-2" data-testid="swipe-actions">
      <button
        type="button"
        onClick={props.onCancel}
        className="rounded-md border px-3 py-1.5 text-xs"
      >
        {t('shopping.item.swipe.cancel')}
      </button>
      <button
        type="button"
        onClick={props.onDelete}
        className="rounded-md bg-destructive px-3 py-1.5 text-xs font-medium text-destructive-foreground"
      >
        {t('shopping.item.swipe.delete')}
      </button>
    </div>
  );
}
