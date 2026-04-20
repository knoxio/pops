import { PageHeader, Skeleton } from '@pops/ui';

export function RulesLoadingState() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Categorisation Rules"
        description="Browse and manage AI categorisation rules"
      />
      <div className="space-y-4">
        {['s0', 's1', 's2', 's3', 's4', 's5'].map((key) => (
          <Skeleton key={key} className="h-12 w-full" />
        ))}
      </div>
    </div>
  );
}
