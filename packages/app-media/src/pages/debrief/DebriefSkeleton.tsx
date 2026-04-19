import { Skeleton } from '@pops/ui';

export function DebriefSkeleton() {
  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6" data-testid="debrief-loading">
      <Skeleton className="h-8 w-48" />
      <div className="flex items-center gap-4">
        <Skeleton className="h-36 w-24 rounded-md" />
        <div className="space-y-2">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-4 w-24" />
        </div>
      </div>
      <div className="flex gap-2">
        <Skeleton className="h-6 w-16" />
        <Skeleton className="h-6 w-16" />
        <Skeleton className="h-6 w-16" />
      </div>
      <div className="grid grid-cols-2 gap-6">
        <Skeleton className="aspect-[2/3] w-full rounded-md" />
        <Skeleton className="aspect-[2/3] w-full rounded-md" />
      </div>
    </div>
  );
}
