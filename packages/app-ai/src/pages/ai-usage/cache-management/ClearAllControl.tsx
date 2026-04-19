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

type ClearAllControlProps = {
  totalEntries: number;
  onClearAll: () => void;
  disabled: boolean;
};

export function ClearAllControl({ totalEntries, onClearAll, disabled }: ClearAllControlProps) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="text-destructive hover:text-destructive"
          disabled={disabled}
        >
          <Trash2 className="mr-1 h-3.5 w-3.5" />
          Clear All
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Clear entire AI cache?</AlertDialogTitle>
          <AlertDialogDescription>
            This will remove all {totalEntries.toLocaleString()} cached categorization results.
            Future transactions will require new API calls.
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
  );
}
