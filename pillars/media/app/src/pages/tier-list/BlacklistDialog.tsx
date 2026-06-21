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

export function BlacklistDialog({
  blacklistTarget,
  onCancel,
  onConfirm,
  isPending,
}: {
  blacklistTarget: { id: number; title: string } | null;
  onCancel: () => void;
  onConfirm: () => void;
  isPending: boolean;
}) {
  return (
    <AlertDialog
      open={blacklistTarget !== null}
      onOpenChange={(open) => {
        if (!open) onCancel();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Mark as not watched?</AlertDialogTitle>
          <AlertDialogDescription>
            This will remove <strong>{blacklistTarget?.title}</strong> from all comparisons and
            rankings across every dimension. This cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} disabled={isPending}>
            {isPending ? 'Removing\u2026' : 'Not watched'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
