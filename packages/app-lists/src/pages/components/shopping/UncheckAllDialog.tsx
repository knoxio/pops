import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * Confirm dialog for PRD-141's "Uncheck all" action. Mirrors the
 * generic `ListDeleteDialog` shape so the keyboard a11y model
 * (Escape closes, outside-click closes) stays consistent.
 */
export interface UncheckAllDialogProps {
  checkedCount: number;
  isPending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export function UncheckAllDialog(props: UncheckAllDialogProps) {
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
      aria-labelledby="shopping-uncheck-all-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div className="w-full max-w-md space-y-4 rounded-lg border bg-background p-6 shadow-lg">
        <h2 id="shopping-uncheck-all-title" className="text-lg font-semibold">
          {t('shopping.uncheckAll.title')}
        </h2>
        <p className="text-sm text-muted-foreground">
          {t('shopping.uncheckAll.body', { count: props.checkedCount })}
        </p>
        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
          >
            {t('shopping.uncheckAll.cancel')}
          </button>
          <button
            type="button"
            onClick={props.onConfirm}
            disabled={props.isPending}
            className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {props.isPending ? t('shopping.uncheckAll.pending') : t('shopping.uncheckAll.confirm')}
          </button>
        </div>
      </div>
    </div>
  );
}
