import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * Hard-delete confirm dialog. The prompt mirrors PRD-140's wording so users
 * understand the cascade ("permanently delete <name> and its N items").
 */
export interface ListDeleteDialogProps {
  name: string;
  itemCount: number;
  isPending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export function ListDeleteDialog(props: ListDeleteDialogProps) {
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
      aria-labelledby="list-delete-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) props.onCancel();
      }}
    >
      <div className="w-full max-w-md space-y-4 rounded-lg border bg-background p-6 shadow-lg">
        <h2 id="list-delete-title" className="text-lg font-semibold">
          {t('detail.delete.title')}
        </h2>
        <p className="text-sm text-muted-foreground">
          {t('detail.delete.body', { name: props.name, count: props.itemCount })}
        </p>
        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={props.onCancel}
            className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
          >
            {t('detail.delete.cancel')}
          </button>
          <button
            type="button"
            onClick={props.onConfirm}
            disabled={props.isPending}
            className="rounded-md bg-destructive px-3 py-1.5 text-sm font-medium text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50"
          >
            {props.isPending ? t('detail.delete.pending') : t('detail.delete.confirm')}
          </button>
        </div>
      </div>
    </div>
  );
}
