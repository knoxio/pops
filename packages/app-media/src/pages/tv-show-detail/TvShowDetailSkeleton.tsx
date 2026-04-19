import { Skeleton } from '@pops/ui';

export function TvShowDetailSkeleton() {
  return (
    <div>
      <div className="relative h-64 md:h-96 bg-muted">
        <div className="absolute inset-0 flex items-end p-6 gap-6">
          <Skeleton className="w-32 md:w-48 aspect-[2/3] rounded-lg shrink-0" />
          <div className="flex-1 space-y-3 pb-4">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-4 w-32" />
          </div>
        </div>
      </div>
      <div className="p-6 space-y-6">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      </div>
    </div>
  );
}
