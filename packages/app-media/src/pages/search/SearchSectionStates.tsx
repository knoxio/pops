import { AlertTriangle } from 'lucide-react';

import { Button, Skeleton } from '@pops/ui';

const SKELETON_COUNT = 3;

export function SearchSectionSkeleton() {
  return (
    <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: SKELETON_COUNT }).map((_, i) => (
        <div key={i} className="flex gap-4 rounded-lg border bg-card p-3">
          <Skeleton className="w-20 shrink-0 rounded-md aspect-[2/3]" />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-7 w-28 mt-auto" />
          </div>
        </div>
      ))}
    </div>
  );
}

interface SearchSectionErrorProps {
  label: string;
  message: string;
  onRetry: () => void;
}

export function SearchSectionError({ label, message, onRetry }: SearchSectionErrorProps) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4">
      <AlertTriangle className="h-5 w-5 text-destructive shrink-0" />
      <div className="flex-1">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{message}</p>
      </div>
      <Button variant="outline" size="sm" onClick={onRetry}>
        Retry
      </Button>
    </div>
  );
}
