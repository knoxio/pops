import { Pencil, Trash2 } from 'lucide-react';
import { Link } from 'react-router';

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

interface HeaderActionsProps {
  id: string;
  itemName: string;
  connectionsCount: number;
  photosCount: number;
  onDelete: () => void;
}

function pluralize(n: number, singular: string, plural?: string): string {
  return n !== 1 ? (plural ?? `${singular}s`) : singular;
}

export function HeaderActions({
  id,
  itemName,
  connectionsCount,
  photosCount,
  onDelete,
}: HeaderActionsProps) {
  return (
    <div className="flex items-center gap-2">
      <Link to={`/inventory/items/${id}/edit`}>
        <Button
          variant="outline"
          size="sm"
          className="font-bold border-app-accent/20 hover:border-app-accent/50 hover:bg-app-accent/5 transition-colors"
        >
          <Pencil className="h-4 w-4 mr-2 text-app-accent" />
          Edit
        </Button>
      </Link>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant="ghost" size="sm" className="text-destructive">
            <Trash2 className="h-4 w-4 mr-2" />
            Delete
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {itemName}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will also remove {connectionsCount} {pluralize(connectionsCount, 'connection')}{' '}
              and {photosCount} {pluralize(photosCount, 'photo')}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="ghost"
              className="text-destructive hover:text-destructive"
              onClick={onDelete}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
