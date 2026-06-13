import { AlertCircle, Library, Sparkles } from 'lucide-react';
import { Link } from 'react-router';

import { Button, Skeleton } from '@pops/ui';

export function PickLoading() {
  return (
    <div className="space-y-3">
      <Skeleton className="aspect-[2/3] w-full rounded-lg" />
      <Skeleton className="h-6 w-3/4" />
      <Skeleton className="h-4 w-1/2" />
    </div>
  );
}

export function FinishedView({ onRefresh }: { onRefresh: () => void }) {
  return (
    <div className="text-center py-8 space-y-4">
      <Sparkles className="h-10 w-10 mx-auto text-app-accent" />
      <p className="text-muted-foreground">You&apos;ve seen all the picks!</p>
      <Button onClick={onRefresh} variant="outline">
        Get More Picks
      </Button>
    </div>
  );
}

export function EmptyView() {
  return (
    <div className="text-center py-8 space-y-4">
      <Library className="h-10 w-10 mx-auto text-muted-foreground" />
      <div className="space-y-1">
        <p className="font-medium">Nothing to pick from</p>
        <p className="text-sm text-muted-foreground">
          All your library movies are watched or already on your watchlist.
        </p>
      </div>
      <Link to="/media/search">
        <Button variant="outline" size="sm">
          Find something new
        </Button>
      </Link>
    </div>
  );
}

export function ErrorView({ message }: { message: string }) {
  return (
    <div className="text-center py-8 space-y-3">
      <AlertCircle className="h-10 w-10 mx-auto text-destructive/70" />
      <div className="space-y-1">
        <p className="font-medium">Couldn&apos;t load picks</p>
        <p className="text-sm text-muted-foreground">{message}</p>
      </div>
    </div>
  );
}
