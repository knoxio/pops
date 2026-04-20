import { Trash2 } from 'lucide-react';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
  Button,
} from '@pops/ui';

type ClearAllRowProps = {
  totalEntries: number;
  onClearAll: () => void;
  disabled: boolean;
};

export function ClearAllRow({ totalEntries, onClearAll, disabled }: ClearAllRowProps) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between rounded-lg border border-destructive/30 p-4">
      <div>
        <h3 className="font-medium">Clear Entire Cache</h3>
        <p className="text-sm text-muted-foreground mt-0.5">
          Remove all cached entries. Future imports will make new API calls to rebuild the cache.
        </p>
      </div>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="shrink-0 text-destructive hover:text-destructive"
            disabled={disabled}
          >
            <Trash2 className="mr-1.5 h-3.5 w-3.5" />
            Clear All
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear entire AI cache?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove all {totalEntries.toLocaleString()} cached categorisation results.
              Future imports will require new API calls, incurring additional costs.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="ghost"
              className="text-destructive hover:text-destructive"
              onClick={onClearAll}
            >
              Clear All
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
