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

export interface BlacklistConfirmDialogProps {
  /** Movie being marked as not watched. `null` closes the dialog. */
  target: { id: number; title: string } | null;
  /** Number of comparisons that will be purged, or null while loading. */
  comparisonsToPurge: number | null;
  isPending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Shared confirmation dialog for "Mark as not watched" (blacklist) actions
 * across CompareArena and Debrief flows.
 */
export function BlacklistConfirmDialog({
  target,
  comparisonsToPurge,
  isPending,
  onConfirm,
  onCancel,
}: BlacklistConfirmDialogProps) {
  return (
    <AlertDialog
      open={target !== null}
      onOpenChange={(open) => {
        if (!open) onCancel();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Mark as not watched?</AlertDialogTitle>
          <AlertDialogDescription>
            <BlacklistMessage comparisonsToPurge={comparisonsToPurge} title={target?.title} />
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={onConfirm} disabled={isPending}>
            {isPending ? 'Removing\u2026' : 'Not watched'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function BlacklistMessage({
  comparisonsToPurge,
  title,
}: {
  comparisonsToPurge: number | null;
  title: string | undefined;
}) {
  if (comparisonsToPurge !== null) {
    return (
      <>
        <span className="font-medium text-foreground">{comparisonsToPurge}</span> comparison
        {comparisonsToPurge !== 1 ? 's' : ''} involving{' '}
        <span className="font-medium text-foreground">{title}</span> will be deleted and scores
        recalculated.
      </>
    );
  }
  return (
    <>
      All comparisons involving <span className="font-medium text-foreground">{title}</span> will be
      deleted and scores recalculated.
    </>
  );
}
