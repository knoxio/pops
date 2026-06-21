import { useTranslation } from 'react-i18next';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@pops/ui';

interface DeleteBudgetDialogProps {
  deletingId: string | null;
  setDeletingId: (id: string | null) => void;
  isDeleting: boolean;
  onConfirm: (id: string) => void;
}

export function DeleteBudgetDialog({
  deletingId,
  setDeletingId,
  isDeleting,
  onConfirm,
}: DeleteBudgetDialogProps) {
  const { t } = useTranslation('finance');
  return (
    <AlertDialog open={!!deletingId} onOpenChange={() => setDeletingId(null)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('budgets.deleteConfirmTitle')}</AlertDialogTitle>
          <AlertDialogDescription>{t('budgets.deleteConfirmDesc')}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isDeleting}>{t('common:cancel')}</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={() => deletingId && onConfirm(deletingId)}
            disabled={isDeleting}
          >
            {isDeleting ? t('common:deleting') : t('common:delete')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
