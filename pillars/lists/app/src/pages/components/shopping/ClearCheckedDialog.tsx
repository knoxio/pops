import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * Confirm dialog for the "Clear checked" action. Same dialog shell as
 * `UncheckAllDialog` — destructive variant of the confirm button.
 */
export interface ClearCheckedDialogProps {
  checkedCount: number;
  isPending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export function ClearCheckedDialog(props: ClearCheckedDialogProps) {
  const { t } = useTranslation('lists');
  const { onCancel } = props;

  useEffect(() => {
    const handle = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', handle);
    return () => document.removeEventListener('keydown', handle);
  }, [onCancel]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="shopping-clear-checked-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div className="w-full max-w-md space-y-4 rounded-lg border bg-background p-6 shadow-lg">
        <h2 id="shopping-clear-checked-title" className="text-lg font-semibold">
          {t('shopping.clearChecked.title')}
        </h2>
        <p className="text-sm text-muted-foreground">
          {t('shopping.clearChecked.body', { count: props.checkedCount })}
        </p>
        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
          >
            {t('shopping.clearChecked.cancel')}
          </button>
          <button
            type="button"
            onClick={props.onConfirm}
            disabled={props.isPending}
            className="rounded-md bg-destructive px-3 py-1.5 text-sm font-medium text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50"
          >
            {props.isPending
              ? t('shopping.clearChecked.pending')
              : t('shopping.clearChecked.confirm')}
          </button>
        </div>
      </div>
    </div>
  );
}
