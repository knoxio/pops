import { PageHeader, Skeleton, SkeletonGrid } from '@pops/ui';

export function AiUsagePageSkeleton() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="AI Observability"
        description="Monitor AI usage, costs, latency, and provider health"
      />
      <SkeletonGrid count={4} itemHeight="h-32" cols="md:grid-cols-2 lg:grid-cols-4" />
      <Skeleton className="h-64" />
    </div>
  );
}
