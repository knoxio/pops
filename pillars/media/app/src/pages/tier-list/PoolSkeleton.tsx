import { Skeleton } from '@pops/ui';

function MovieCardSkeleton() {
  return (
    <div className="flex flex-col items-center gap-2 w-28">
      <Skeleton className="w-28 aspect-[2/3] rounded-lg" />
      <Skeleton className="h-3 w-20" />
    </div>
  );
}

export function PoolSkeleton() {
  return (
    <div className="flex flex-wrap justify-center gap-4 py-8">
      {Array.from({ length: 8 }).map((_, i) => (
        <MovieCardSkeleton key={i} />
      ))}
    </div>
  );
}
