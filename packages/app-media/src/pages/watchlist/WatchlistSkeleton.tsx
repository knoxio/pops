import { Skeleton } from '@pops/ui';

const MOBILE_SKELETON_KEYS = ['wm0', 'wm1', 'wm2', 'wm3', 'wm4'] as const;
const DESKTOP_SKELETON_KEYS = [
  'wd0',
  'wd1',
  'wd2',
  'wd3',
  'wd4',
  'wd5',
  'wd6',
  'wd7',
  'wd8',
  'wd9',
] as const;

export function WatchlistSkeleton() {
  return (
    <>
      <div className="space-y-3 md:hidden">
        {MOBILE_SKELETON_KEYS.map((key) => (
          <div key={key} className="flex gap-4 p-3 rounded-lg border">
            <Skeleton className="w-16 aspect-[2/3] rounded shrink-0" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-5 w-48" />
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-3 w-full" />
            </div>
          </div>
        ))}
      </div>
      <div className="hidden md:grid grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
        {DESKTOP_SKELETON_KEYS.map((key) => (
          <div key={key} className="space-y-2">
            <Skeleton className="w-full aspect-[2/3] rounded-md" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        ))}
      </div>
    </>
  );
}
