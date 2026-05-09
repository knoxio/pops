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

import type { Transaction } from './types';

interface Props {
  deletingTx: Transaction | null;
  setDeletingTx: (t: Transaction | null) => void;
  isDeleting: boolean;
  onConfirm: (tx: Transaction) => void;
}

export function DeleteTransactionDialog({
  deletingTx,
  setDeletingTx,
  isDeleting,
  onConfirm,
}: Props) {
  return (
    <AlertDialog open={!!deletingTx} onOpenChange={() => setDeletingTx(null)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
          <AlertDialogDescription>
            This will delete this transaction. You can undo from the toast for a few seconds after.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={() => deletingTx && onConfirm(deletingTx)}
            disabled={isDeleting}
          >
            {isDeleting ? 'Deleting...' : 'Delete'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
