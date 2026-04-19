import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@pops/ui';

import type { DeleteConfirmState } from '../useLocationTreePageModel';

interface DeleteDialogProps {
  deleteConfirm: DeleteConfirmState | null;
  onConfirm: () => void;
  onCancel: () => void;
  isPending: boolean;
}

export function DeleteDialog({ deleteConfirm, onConfirm, onCancel, isPending }: DeleteDialogProps) {
  return (
    <Dialog open={!!deleteConfirm} onOpenChange={(open) => !open && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete &ldquo;{deleteConfirm?.name}&rdquo;?</DialogTitle>
          <DialogDescription>This action cannot be undone.</DialogDescription>
        </DialogHeader>
        {deleteConfirm && (
          <div className="space-y-2 text-sm">
            {deleteConfirm.stats.childCount > 0 && (
              <p>
                This location has <strong>{deleteConfirm.stats.childCount}</strong> direct{' '}
                {deleteConfirm.stats.childCount === 1 ? 'sub-location' : 'sub-locations'}
                {deleteConfirm.stats.descendantCount > deleteConfirm.stats.childCount &&
                  ` (${deleteConfirm.stats.descendantCount} total)`}
                . They will all be deleted.
              </p>
            )}
            {deleteConfirm.stats.totalItemCount > 0 && (
              <p>
                <strong>{deleteConfirm.stats.totalItemCount}</strong>{' '}
                {deleteConfirm.stats.totalItemCount === 1 ? 'item' : 'items'} will become unlocated.
              </p>
            )}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>Cancel</Button>
          <Button
            variant="ghost"
            className="text-destructive hover:text-destructive"
            onClick={onConfirm}
            disabled={isPending}
          >
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
